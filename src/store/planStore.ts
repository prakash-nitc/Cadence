import { create } from 'zustand';
import {
  commitmentsBetween,
  countedDoneForTag,
  getDay,
  getLog,
  putDay,
  putLog,
  replaceCommitments,
} from '../db/repo';
import type { CommitmentRecord, DayRecord, LogRecord } from '../db/schema';
import type { Prefs } from '../lib/prefs';
import { addDays, dateKey } from '../lib/time';

/** One line of tomorrow's plan, before it becomes a commitment. */
export interface PlanItem {
  key: string;
  source: 'carry' | 'suggestion';
  /** The commitment being carried, if any. */
  carriedFrom: CommitmentRecord | null;
  blockId: string | null;
  label: string;
  targetType: CommitmentRecord['targetType'];
  target: number;
  plannedMinutes: number;
  tags: string[];
  selected: boolean;
  movedCount: number;
  detail: string | null;
}

export interface LogInput {
  recallDrillDone: boolean;
  sleepHours: number;
  energy: LogRecord['energy'];
  hardestThing: string;
  blocksContained: number;
  blocksTotal: number;
}

interface PlanState {
  tomorrow: string | null;
  tomorrowDay: DayRecord | null;
  /** Undone work from days already gone, one line per lineage. */
  carryOver: CommitmentRecord[];
  history: CommitmentRecord[];
  problemsDone: number;
  todayLog: LogRecord | null;
  lastLog: LogRecord | null;
  loaded: boolean;

  load: (today: string, prefs: Prefs) => Promise<void>;
  saveLog: (today: string, input: LogInput, at: number) => Promise<void>;
  savePlan: (templateId: string, items: PlanItem[], at: number) => Promise<void>;
}

/**
 * The evening flow's data — SPEC §3.4.
 *
 * Everything the form needs is loaded once so the flow can be filled in and saved
 * without waiting on the database. The whole point is that it takes under three minutes.
 */
export const usePlan = create<PlanState>((set, get) => ({
  tomorrow: null,
  tomorrowDay: null,
  carryOver: [],
  history: [],
  problemsDone: 0,
  todayLog: null,
  lastLog: null,
  loaded: false,

  load: async (today, prefs) => {
    const tomorrow = dateKey(addDays(new Date(`${today}T12:00:00`), 1));
    const windowStart = dateKey(
      addDays(new Date(`${today}T12:00:00`), -prefs.historyWindowDays),
    );

    const yesterday = dateKey(addDays(new Date(`${today}T12:00:00`), -1));

    const [tomorrowDay, past, problemsDone, todayLog, lastLog] = await Promise.all([
      getDay(tomorrow),
      commitmentsBetween(windowStart, today),
      countedDoneForTag('dsa'),
      getLog(today),
      getLog(yesterday),
    ]);

    set({
      tomorrow,
      tomorrowDay,
      carryOver: carryOverPool(past, tomorrow),
      history: past,
      problemsDone,
      todayLog,
      lastLog,
      loaded: true,
    });
  },

  saveLog: async (today, input, at) => {
    const log: LogRecord = { date: today, ...input, createdAt: at };
    await putLog(log);
    set({ todayLog: log });
  },

  savePlan: async (templateId, items, at) => {
    const { tomorrow, tomorrowDay } = get();
    if (!tomorrow) return;

    const chosen = items.filter((item) => item.selected);

    const commitments: CommitmentRecord[] = chosen.map((item) => ({
      id: crypto.randomUUID(),
      dayDate: tomorrow,
      blockId: item.blockId,
      label: item.label,
      targetType: item.targetType,
      target: item.target,
      // A carried commitment starts tomorrow at zero. Yesterday's partial credit was
      // scored yesterday; carrying it forward with progress already on it would score
      // the same work twice.
      done: 0,
      plannedMinutes: item.plannedMinutes,
      tags: item.tags,
      status: 'open',
      displacedBy: null,
      movedCount: item.carriedFrom ? item.carriedFrom.movedCount + 1 : 0,
      originDate: item.carriedFrom ? item.carriedFrom.originDate : tomorrow,
    }));

    await replaceCommitments(tomorrow, commitments);

    const day: DayRecord = {
      ...(tomorrowDay ?? {
        date: tomorrow,
        anchorAt: null,
        blocks: [],
        degradation: [],
        pushes: [],
        placementMode: false,
        score: null,
        band: null,
        gatePassed: null,
      }),
      date: tomorrow,
      template: templateId,
      // This is what makes the day planned. An unplanned day is red regardless — §4.1.
      plannedAt: at,
    };

    await putDay(day);
    set({ tomorrowDay: day, tomorrow });
  },
}));

/**
 * The carry-over pool — SPEC §4.1.
 *
 * Undone commitments from days already gone. One line per lineage: if the same work has
 * been carried three times, only the most recent copy is offered, and its `movedCount`
 * is what the badge reads. A night of skipped planning does not lose the pool — anything
 * still open from earlier days is still in it.
 */
function carryOverPool(past: CommitmentRecord[], tomorrow: string): CommitmentRecord[] {
  const undone = past.filter(
    (commitment) =>
      commitment.dayDate < tomorrow &&
      (commitment.status === 'open' || commitment.status === 'partial'),
  );

  // A lineage is the work, not the day it started: two commitments first planned on the
  // same date are different lineages, so the label has to be part of the key.
  const lineageOf = (commitment: CommitmentRecord): string =>
    `${commitment.originDate}|${commitment.label}`;

  const latestPerLineage = new Map<string, CommitmentRecord>();
  for (const commitment of undone) {
    const existing = latestPerLineage.get(lineageOf(commitment));
    if (!existing || commitment.dayDate > existing.dayDate) {
      latestPerLineage.set(lineageOf(commitment), commitment);
    }
  }

  return [...latestPerLineage.values()].sort((a, b) => b.movedCount - a.movedCount);
}
