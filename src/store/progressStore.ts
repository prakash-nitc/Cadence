import { create } from 'zustand';
import {
  commitmentsBetween,
  listDays,
  listMilestoneProgress,
  logsBetween,
  putMilestoneProgress,
} from '../db/repo';
import type { CommitmentRecord, DayRecord, LogRecord } from '../db/schema';
import { addDays, dateKey } from '../lib/time';

/** 18 weeks — the span the consistency grid shows, and the widest thing on the screen. */
export const GRID_DAYS = 18 * 7;

interface ProgressState {
  loaded: boolean;
  days: DayRecord[];
  commitments: CommitmentRecord[];
  logs: LogRecord[];
  milestoneProgress: Map<string, { checked: string[]; doneAt: number | null }>;

  load: (asOf: string) => Promise<void>;
  toggleChecklistItem: (key: string, item: string) => Promise<void>;
  toggleDone: (key: string, at: number) => Promise<void>;
}

/**
 * Everything the Progress screen reads — SPEC §4.3–§4.5. Read-only apart from ticking a
 * milestone: the three horizons are all derived from daily commitments, so nothing here
 * is logged twice.
 */
export const useProgress = create<ProgressState>((set, get) => {
  const writeProgress = async (
    key: string,
    change: (current: { checked: string[]; doneAt: number | null }) => {
      checked: string[];
      doneAt: number | null;
    },
  ): Promise<void> => {
    const current = get().milestoneProgress.get(key) ?? { checked: [], doneAt: null };
    const next = change(current);

    await putMilestoneProgress({ key, ...next });

    const milestoneProgress = new Map(get().milestoneProgress);
    milestoneProgress.set(key, next);
    set({ milestoneProgress });
  };

  return {
    loaded: false,
    days: [],
    commitments: [],
    logs: [],
    milestoneProgress: new Map(),

    load: async (asOf) => {
      const from = dateKey(addDays(new Date(`${asOf}T12:00:00`), -GRID_DAYS));

      const [days, commitments, logs, progress] = await Promise.all([
        listDays(from, asOf),
        commitmentsBetween(from, asOf),
        logsBetween(from, asOf),
        listMilestoneProgress(),
      ]);

      set({
        days,
        commitments,
        logs,
        milestoneProgress: new Map(
          progress.map((entry) => [entry.key, { checked: entry.checked, doneAt: entry.doneAt }]),
        ),
        loaded: true,
      });
    },

    toggleChecklistItem: async (key, item) => {
      await writeProgress(key, (current) => ({
        ...current,
        checked: current.checked.includes(item)
          ? current.checked.filter((entry) => entry !== item)
          : [...current.checked, item],
      }));
    },

    toggleDone: async (key, at) => {
      await writeProgress(key, (current) => ({
        ...current,
        doneAt: current.doneAt === null ? at : null,
      }));
    },
  };
});
