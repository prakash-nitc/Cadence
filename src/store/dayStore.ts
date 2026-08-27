import { create } from 'zustand';
import { FIXED_WINDOWS } from '../config/schedule.config';
import {
  commitmentsFor,
  deleteCommitment,
  deleteSavedTemplate,
  getDay,
  listSavedTemplates,
  putDay,
  putCommitments,
  putSavedTemplate,
  resolveActiveDate,
} from '../db/repo';
import type { BlockDef } from '../config/schedule.config';
import type { CommitmentRecord, DayRecord, SavedTemplate } from '../db/schema';
import { isResolved, pullForward, pushRemaining, resolveBlock } from '../engine/boundaries';
import { layoutDay } from '../engine/layout';
import { planDay } from '../engine/capacity';
import { statusForProgress } from '../engine/scoring';
import { describeDegradation } from '../lib/copy';
import type { Prefs } from '../lib/prefs';
import { blocksForTemplate } from '../lib/templates';
import { minutesBetween, toHHMM } from '../lib/time';

/**
 * Notes on a day's layout that outlive a re-anchor.
 *
 * `degradation` is otherwise a description of the current layout and is rewritten each
 * time the day is laid. A restart is a fact about the day rather than about a layout, so
 * it has to survive the next one — recording it and then wiping it would be worse than
 * not recording it at all.
 */
const RESTART_NOTE = 'Day restarted at';

/** What a new commitment needs; everything else is derived. */
/** The three fields of a commitment that are a plan rather than a record. */
export interface CommitmentEdit {
  label: string;
  target: number;
  plannedMinutes: number;
}

export interface NewCommitment {
  blockId: string | null;
  label: string;
  targetType: CommitmentRecord['targetType'];
  target: number;
  plannedMinutes: number;
  tags: string[];
}

interface DayState {
  date: string | null;
  day: DayRecord | null;
  commitments: CommitmentRecord[];
  savedTemplates: SavedTemplate[];
  loaded: boolean;

  load: (now: number) => Promise<void>;
  /**
   * `blocks` overrides the template lookup — a custom day or a quick carve is a set of
   * blocks that exists nowhere but on this day.
   */
  startDay: (
    anchor: Date,
    templateId: string,
    prefs: Prefs,
    customBlocks?: BlockDef[],
  ) => Promise<void>;
  /**
   * Re-lay the part of the day that has not happened yet. What was already resolved
   * stays exactly as it was — re-planning the afternoon must not erase the morning.
   */
  relayDay: (from: Date, blocks: BlockDef[], prefs: Prefs) => Promise<void>;
  /**
   * Throw the day's layout away and go back to Start day.
   *
   * Discards the anchor, the blocks and their marks, and the push log — all of which
   * describe a schedule the user is abandoning. Keeps the commitments and `plannedAt`,
   * because what you committed to is not the same thing as when you meant to do it.
   *
   * The reset is written into the day's notes rather than erasing the fact it happened.
   * Restarting a mis-laid morning is legitimate; quietly rewriting history is not.
   */
  resetDay: (at: number) => Promise<void>;
  saveTemplate: (name: string, blocks: BlockDef[], at: number) => Promise<string>;
  removeTemplate: (id: string) => Promise<void>;
  closeBlock: (blockId: string, status: 'contained' | 'overran', at: number) => Promise<void>;
  skipBlock: (blockId: string, at: number) => Promise<void>;
  correctBlock: (
    blockId: string,
    status: 'contained' | 'overran' | 'skipped',
    at: number,
  ) => Promise<void>;
  push: (minutes: number, at: number) => Promise<void>;
  startNextEarly: (minutes: number, at: number) => Promise<void>;
  setPlacementMode: (on: boolean) => Promise<void>;

  addCommitment: (input: NewCommitment, at: number) => Promise<void>;
  setDone: (id: string, done: number) => Promise<void>;
  /**
   * Re-plan a commitment: its name, its target, or what it is worth.
   *
   * Resizing a block leaves its commitments carrying the old weight, and deleting and
   * re-adding one just to change a number is friction with no honesty benefit — the same
   * edit was always possible, only slower.
   */
  editCommitment: (id: string, edit: CommitmentEdit) => Promise<void>;
  dropCommitment: (
    id: string,
    reason: 'skipped' | 'avoided' | 'displaced',
    displacedBy: string | null,
  ) => Promise<void>;
  removeCommitment: (id: string) => Promise<void>;
}

/**
 * Today's day record and the actions that change it.
 *
 * Every mutation writes through to the database immediately — the done-condition for
 * this session is that a worked-through day survives a refresh, and batching writes
 * would be the obvious way to fail it.
 */
export const useDay = create<DayState>((set, get) => {
  /** Persist and mirror in one step, so the store can never drift from the database. */
  const commit = async (day: DayRecord): Promise<void> => {
    await putDay(day);
    set({ day });
  };

  const withBlocks = (day: DayRecord, blocks: DayRecord['blocks']): DayRecord => ({
    ...day,
    blocks,
  });

  /** Apply a change to one commitment, persist it, and mirror it in the store. */
  const writeCommitment = async (
    id: string,
    change: (commitment: CommitmentRecord) => CommitmentRecord,
  ): Promise<void> => {
    const current = get().commitments.find((commitment) => commitment.id === id);
    if (!current) return;

    const next = change(current);
    await putCommitments([next]);
    set({
      commitments: get().commitments.map((commitment) =>
        commitment.id === id ? next : commitment,
      ),
    });
  };

  return {
    date: null,
    day: null,
    commitments: [],
    savedTemplates: [],
    loaded: false,

    load: async (now) => {
      const date = await resolveActiveDate(now);
      const [day, commitments, savedTemplates] = await Promise.all([
        getDay(date),
        commitmentsFor(date),
        listSavedTemplates(),
      ]);
      set({ date, day, commitments, savedTemplates, loaded: true });
    },

    startDay: async (anchor, templateId, prefs, customBlocks) => {
      const { date, savedTemplates } = get();
      if (!date) return;

      const template = customBlocks ?? blocksForTemplate(templateId, savedTemplates);
      if (!template) throw new Error(`Unknown template: ${templateId}`);

      // A day arranged by hand is laid exactly as arranged. Degradation exists to fit a
      // *template* to a late start automatically; running it over an explicit
      // arrangement would silently undo decisions the user just made, and would make the
      // clock times shown while arranging a lie.
      const { blocks, degradation } = customBlocks
        ? { blocks: layoutDay(anchor, customBlocks, FIXED_WINDOWS), degradation: null }
        : planDay(anchor, template, FIXED_WINDOWS, prefs);

      const existing = await getDay(date);

      await commit({
        // A day planned last night keeps its plan and its commitments.
        ...(existing ?? {
          date,
          placementMode: false,
          score: null,
          band: null,
          gatePassed: null,
          plannedAt: null,
        }),
        date,
        anchorAt: anchor.getTime(),
        template: templateId,
        blocks,
        degradation: [
          ...(existing?.degradation ?? []).filter((line) => line.startsWith(RESTART_NOTE)),
          ...(degradation
            ? describeDegradation(degradation, anchor, prefs.gymCutoffHour)
            : [`Arranged at ${toHHMM(anchor)}. ${customBlocks?.length ?? 0} blocks, as laid out.`]),
        ],
        pushes: existing?.pushes ?? [],
      });
    },

    closeBlock: async (blockId, status, at) => {
      const { day } = get();
      if (!day) return;
      await commit(withBlocks(day, resolveBlock(day.blocks, blockId, status, at)));
    },

    skipBlock: async (blockId, at) => {
      const { day } = get();
      if (!day) return;
      // Skipping leaves a hole. Nothing moves — SPEC §2.3.
      await commit(withBlocks(day, resolveBlock(day.blocks, blockId, 'skipped', at)));
    },

    correctBlock: async (blockId, status, at) => {
      const { day } = get();
      if (!day) return;
      await commit(withBlocks(day, resolveBlock(day.blocks, blockId, status, at)));
    },

    push: async (minutes, at) => {
      const { day } = get();
      if (!day) return;
      // Explicit and logged. How often this gets used is itself a metric — SPEC §2.3.
      await commit({
        ...day,
        blocks: pushRemaining(day.blocks, at, minutes),
        pushes: [...day.pushes, { at, minutes }],
      });
    },

    startNextEarly: async (minutes, at) => {
      const { day } = get();
      if (!day) return;
      await commit(withBlocks(day, pullForward(day.blocks, at, minutes)));
    },

    setPlacementMode: async (on) => {
      const { day } = get();
      if (!day) return;
      await commit({ ...day, placementMode: on });
    },

    relayDay: async (from, blocks, prefs) => {
      const { day } = get();
      if (!day) return;

      // Keep the record of everything already answered for, then lay the new shape
      // from `from`. Commitments attach by block id, so anything whose block survives
      // stays attached and anything else falls back to the day's unattached list.
      //
      // A settled block is clipped to end at `from`. Closing a block early and then
      // re-laying otherwise left the old block running past the start of the new plan,
      // so the timeline showed two blocks occupying the same minutes. What the user
      // actually did is recorded in `actualEndedAt`; the scheduled end has no business
      // extending into a stretch of day that is being re-planned.
      const cut = from.getTime();
      const settled = day.blocks
        .filter((block) => isResolved(block) && block.startsAt < cut)
        .map((block) =>
          block.endsAt > cut
            ? { ...block, endsAt: cut, minutes: minutesBetween(block.startsAt, cut) }
            : block,
        );

      const relaid = layoutDay(from, blocks, FIXED_WINDOWS);

      await commit({
        ...day,
        // Chronological, so the timeline reads in the order the day happens.
        blocks: [...settled, ...relaid].sort((a, b) => a.startsAt - b.startsAt),
        degradation: [
          ...day.degradation,
          `Re-laid at ${toHHMM(from)}. ${blocks.length} blocks from here.`,
        ],
      });
      void prefs;
    },

    resetDay: async (at) => {
      const { day } = get();
      if (!day) return;

      await commit({
        ...day,
        anchorAt: null,
        blocks: [],
        pushes: [],
        degradation: [
          ...day.degradation.filter((line) => line.startsWith(RESTART_NOTE)),
          `${RESTART_NOTE} ${toHHMM(at)}. Previous layout discarded.`,
        ],
      });
    },

    saveTemplate: async (name, blocks, at) => {
      const id = `saved:${crypto.randomUUID()}`;
      await putSavedTemplate({ id, name, blocks, createdAt: at });
      set({ savedTemplates: await listSavedTemplates() });
      return id;
    },

    removeTemplate: async (id) => {
      await deleteSavedTemplate(id);
      set({ savedTemplates: await listSavedTemplates() });
    },

    addCommitment: async (input, at) => {
      const { date, day, commitments } = get();
      if (!date) return;

      const record: CommitmentRecord = {
        id: crypto.randomUUID(),
        dayDate: date,
        blockId: input.blockId,
        label: input.label,
        targetType: input.targetType,
        target: input.target,
        done: 0,
        plannedMinutes: input.plannedMinutes,
        tags: input.tags,
        status: 'open',
        displacedBy: null,
        movedCount: 0,
        originDate: date,
      };

      await putCommitments([record]);
      set({ commitments: [...commitments, record] });

      // Committing to something is what makes a day planned. Until then it scores red
      // regardless of what got done — SPEC §4.1. Session 4's evening flow sets this the
      // night before, which is the intended path; this covers a day committed to late.
      if (day && day.plannedAt === null) await commit({ ...day, plannedAt: at });
    },

    setDone: async (id, done) => {
      await writeCommitment(id, (commitment) => {
        const next = { ...commitment, done: Math.max(0, done) };
        // Progress never resurrects a dropped commitment — a drop is deliberate.
        return { ...next, status: statusForProgress(next) };
      });
    },

    editCommitment: async (id, edit) => {
      await writeCommitment(id, (commitment) => {
        const next = {
          ...commitment,
          label: edit.label.trim() || commitment.label,
          target: Math.max(commitment.targetType === 'binary' ? 1 : 1, edit.target),
          plannedMinutes: Math.max(0, edit.plannedMinutes),
        };
        // Changing the target changes what "done" means, so the status follows it.
        return { ...next, status: statusForProgress(next) };
      });
    },

    dropCommitment: async (id, reason, displacedBy) => {
      // Dropping requires a reason and the distinction is the whole point — SPEC §4.1.
      // Displaced leaves scoring entirely; skipped and avoided score zero.
      await writeCommitment(id, (commitment) => ({
        ...commitment,
        status: reason,
        displacedBy: reason === 'displaced' ? displacedBy : null,
      }));
    },

    removeCommitment: async (id) => {
      await deleteCommitment(id);
      set({ commitments: get().commitments.filter((commitment) => commitment.id !== id) });
    },
  };
});
