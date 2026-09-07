import { create } from 'zustand';
import {
  commitmentsBetween,
  commitmentsFor,
  countedDoneForTag,
  getDay,
  getLog,
  putDay,
  putLog,
  replaceCommitments,
  retireCommitment,
} from '../db/repo';
import type { BlockDef } from '../config/schedule.config';
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
  wentWell: string;
  wentWrong: string;
  toImprove: string;
  blocksContained: number;
  blocksTotal: number;
}

interface PlanState {
  /**
   * The day being planned. Usually tomorrow, and not always.
   *
   * It used to be derived as `activeDate + 1`, and the active date rolls to the calendar
   * day once the laid day's blocks have run out. Sitting down at 01:30 having worked the
   * previous day therefore logged a day with nothing on it and planned the day after the
   * one you meant — the plan simply was not there the next morning.
   */
  planDate: string | null;
  planDay: DayRecord | null;
  /** The day being logged. The one you actually worked, which may be yesterday. */
  logDate: string | null;
  /** Commitments on the day being logged, so the review lists the right ones. */
  logCommitments: CommitmentRecord[];
  /** Undone work from days already gone, one line per lineage. */
  carryOver: CommitmentRecord[];
  history: CommitmentRecord[];
  problemsDone: number;
  todayLog: LogRecord | null;
  lastLog: LogRecord | null;
  loaded: boolean;

  load: (logDate: string, planDate: string, prefs: Prefs) => Promise<void>;
  saveLog: (today: string, input: LogInput, at: number) => Promise<void>;
  /** Tomorrow's free-text note, saved on its own so it survives a half-finished plan. */
  saveBrainDump: (text: string) => Promise<void>;
  /**
   * Drop a carried commitment for good, so tomorrow stops offering it.
   *
   * Unticking means "not tomorrow" and the work returns; this means "not at all". Only
   * carried work needs it — a suggestion that is never ticked was never a record.
   */
  retireCarried: (id: string, at: number) => Promise<void>;
  savePlan: (
    templateId: string,
    items: PlanItem[],
    at: number,
    arrangement?: { blocks: BlockDef[]; wakeAt: string },
  ) => Promise<void>;
}

/**
 * The evening flow's data — SPEC §3.4.
 *
 * Everything the form needs is loaded once so the flow can be filled in and saved
 * without waiting on the database. The whole point is that it takes under three minutes.
 */
export const usePlan = create<PlanState>((set, get) => ({
  planDate: null,
  planDay: null,
  logDate: null,
  logCommitments: [],
  carryOver: [],
  history: [],
  problemsDone: 0,
  todayLog: null,
  lastLog: null,
  loaded: false,

  load: async (logDate, planDate, prefs) => {
    const windowStart = dateKey(
      addDays(new Date(`${logDate}T12:00:00`), -prefs.historyWindowDays),
    );

    const dayBefore = dateKey(addDays(new Date(`${logDate}T12:00:00`), -1));

    const [planDay, past, problemsDone, todayLog, lastLog, logCommitments] = await Promise.all([
      getDay(planDate),
      commitmentsBetween(windowStart, logDate),
      countedDoneForTag('dsa_new'),
      getLog(logDate),
      getLog(dayBefore),
      commitmentsFor(logDate),
    ]);

    set({
      logDate,
      logCommitments,
      planDate,
      planDay,
      carryOver: carryOverPool(past, planDate),
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

  retireCarried: async (id, at) => {
    await retireCommitment(id, at);
    set({ carryOver: get().carryOver.filter((commitment) => commitment.id !== id) });
  },

  saveBrainDump: async (text) => {
    const { planDate, planDay } = get();
    if (!planDate) return;

    const day: DayRecord = {
      ...(planDay ?? {
        date: planDate,
        anchorAt: null,
        template: 'full',
        blocks: [],
        degradation: [],
        pushes: [],
        placementMode: false,
        score: null,
        band: null,
        gatePassed: null,
        // Writing a note is not planning the day. Only savePlan sets this.
        plannedAt: null,
        plannedBlocks: null,
        plannedAnchor: null,
      }),
      date: planDate,
      brainDump: text,
    };

    await putDay(day);
    set({ planDay: day });
  },

  savePlan: async (templateId, items, at, arrangement) => {
    const { planDate, planDay } = get();
    if (!planDate) return;

    const chosen = items.filter((item) => item.selected);

    const commitments: CommitmentRecord[] = chosen.map((item) => ({
      id: crypto.randomUUID(),
      dayDate: planDate,
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
      originDate: item.carriedFrom ? item.carriedFrom.originDate : planDate,
    }));

    await replaceCommitments(planDate, commitments);

    const day: DayRecord = {
      ...(planDay ?? {
        date: planDate,
        anchorAt: null,
        blocks: [],
        degradation: [],
        pushes: [],
        placementMode: false,
        score: null,
        band: null,
        gatePassed: null,
        plannedBlocks: null,
        plannedAnchor: null,
      }),
      date: planDate,
      template: templateId,
      // This is what makes the day planned. An unplanned day is red regardless — §4.1.
      plannedAt: at,
      plannedBlocks: arrangement ? arrangement.blocks : null,
      plannedAnchor: arrangement ? arrangement.wakeAt : null,
    };

    await putDay(day);
    set({ planDay: day, planDate });
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
      // Retired work is not undone work. Deleting it from a plan has to mean it stops
      // coming back, or "delete" is just a slower way of unticking.
      !commitment.retiredAt &&
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
