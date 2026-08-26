import { create } from 'zustand';
import { FIXED_WINDOWS } from '../config/schedule.config';
import {
  commitmentsFor,
  deleteCommitment,
  getDay,
  listSavedTemplates,
  putDay,
  putCommitments,
  resolveActiveDate,
} from '../db/repo';
import type { CommitmentRecord, DayRecord, SavedTemplate } from '../db/schema';
import { pullForward, pushRemaining, resolveBlock } from '../engine/boundaries';
import { planDay } from '../engine/capacity';
import { statusForProgress } from '../engine/scoring';
import { describeDegradation } from '../lib/copy';
import type { Prefs } from '../lib/prefs';
import { blocksForTemplate } from '../lib/templates';

/** What a new commitment needs; everything else is derived. */
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
  startDay: (anchor: Date, templateId: string, prefs: Prefs) => Promise<void>;
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

    startDay: async (anchor, templateId, prefs) => {
      const { date, savedTemplates } = get();
      if (!date) return;

      const template = blocksForTemplate(templateId, savedTemplates);
      if (!template) throw new Error(`Unknown template: ${templateId}`);

      const { blocks, degradation } = planDay(anchor, template, FIXED_WINDOWS, prefs);
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
        degradation: describeDegradation(degradation, anchor, prefs.gymCutoffHour),
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
