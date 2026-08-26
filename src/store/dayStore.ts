import { create } from 'zustand';
import { FIXED_WINDOWS } from '../config/schedule.config';
import {
  getDay,
  listSavedTemplates,
  putDay,
  resolveActiveDate,
} from '../db/repo';
import type { DayRecord, SavedTemplate } from '../db/schema';
import { pullForward, pushRemaining, resolveBlock } from '../engine/boundaries';
import { planDay } from '../engine/capacity';
import { describeDegradation } from '../lib/copy';
import type { Prefs } from '../lib/prefs';
import { blocksForTemplate } from '../lib/templates';

interface DayState {
  date: string | null;
  day: DayRecord | null;
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

  return {
    date: null,
    day: null,
    savedTemplates: [],
    loaded: false,

    load: async (now) => {
      const date = await resolveActiveDate(now);
      const [day, savedTemplates] = await Promise.all([getDay(date), listSavedTemplates()]);
      set({ date, day, savedTemplates, loaded: true });
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
  };
});
