import { create } from 'zustand';
import {
  commitmentsBetween,
  commitmentsFor,
  countedDoneForTag,
  getDay,
  getLog,
  putCommitments,
  putDay,
  putLog,
  replaceCommitments,
  retireCommitment,
} from '../db/repo';
import { COMMITMENT_PRESETS, type BlockDef } from '../config/schedule.config';
import { carryOverPool, weightFor } from '../engine/carry';
import { withDone, withDrop } from '../engine/scoring';
import { useDay } from './dayStore';
import type { CommitmentRecord, DayRecord, LogRecord } from '../db/schema';
import type { Size } from '../engine/shape';
import type { Prefs } from '../lib/prefs';
import { addDays, dateKey } from '../lib/time';

/** One line of tomorrow's plan, before it becomes a commitment. */
export interface PlanItem {
  /**
   * Big, medium or small — chosen, not computed.
   *
   * Seeded from planned minutes and then owned by the user: how big a piece of work
   * feels is not a function of its clock time.
   */
  size?: Size | null;
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
  /**
   * Dates the user picked by hand, and the default they were picked against.
   *
   * Held here rather than in the screen because the screen unmounts on every tab switch.
   * Setting the plan date to today, glancing at Day and coming back used to silently
   * put it back to tomorrow — and then the note you wrote went to the wrong day.
   *
   * `against` is the default at the time of picking; once that moves, the day has rolled
   * over and the picks are stale rather than deliberate.
   */
  picks: { against: string; log: string | null; plan: string | null };
  setPick: (which: 'log' | 'plan', date: string, against: string) => void;
  /** Commitments on the day being logged, so the review lists the right ones. */
  logCommitments: CommitmentRecord[];
  /** Undone work from days already gone, one line per lineage. */
  carryOver: CommitmentRecord[];
  /** Routine commitments left short on earlier days, which are deliberately not carried. */
  routineLeftShort: number;
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
  /**
   * Progress and drops for the day being logged — which is not always the live day. Late at
   * night Plan logs yesterday, and these used to go through the live day's store, which does
   * not hold yesterday's commitments, so nothing was saved and nothing on screen changed.
   */
  setLogDone: (id: string, done: number) => Promise<void>;
  dropLogged: (
    id: string,
    reason: 'skipped' | 'avoided' | 'displaced',
    displacedBy: string | null,
  ) => Promise<void>;
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
  picks: { against: '', log: null, plan: null },
  carryOver: [],
  routineLeftShort: 0,
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
      ...(() => {
        const pool = carryOverPool(past, planDate, COMMITMENT_PRESETS);
        return { carryOver: pool.carry, routineLeftShort: pool.routineLeftShort };
      })(),
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

  setPick: (which, date, against) => {
    const current = get().picks;
    const base =
      current.against === against ? current : { against, log: null, plan: null };
    set({ picks: { ...base, against, [which]: date } });
  },

  setLogDone: async (id, done) => {
    await writeLogged(id, (commitment) => withDone(commitment, done));
  },

  dropLogged: async (id, reason, displacedBy) => {
    await writeLogged(id, (commitment) => withDrop(commitment, reason, displacedBy));
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
      plannedMinutes: weightFor(item.targetType, item.target, item.plannedMinutes),
      tags: item.tags,
      status: 'open',
      displacedBy: null,
      movedCount: item.carriedFrom ? item.carriedFrom.movedCount + 1 : 0,
      originDate: item.carriedFrom ? item.carriedFrom.originDate : planDate,
      // Suggestions are the roadmap's daily work; carried work is one-off by definition.
      routine: item.source === 'suggestion',
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
 * Change one of the logged day's commitments: persist it, show it, and keep everything
 * derived from it current — the history the carry-over pool reads, and the live day's copy
 * on Now and Day when the logged day is today.
 */
async function writeLogged(
  id: string,
  change: (commitment: CommitmentRecord) => CommitmentRecord,
): Promise<void> {
  const state = usePlan.getState();
  const current = state.logCommitments.find((commitment) => commitment.id === id);
  if (!current) return;

  const next = change(current);
  await putCommitments([next]);

  const replace = (list: CommitmentRecord[]): CommitmentRecord[] =>
    list.map((commitment) => (commitment.id === id ? next : commitment));
  const history = replace(state.history);
  const pool = state.planDate
    ? carryOverPool(history, state.planDate, COMMITMENT_PRESETS)
    : null;

  usePlan.setState({
    logCommitments: replace(usePlan.getState().logCommitments),
    history,
    ...(pool ? { carryOver: pool.carry, routineLeftShort: pool.routineLeftShort } : {}),
  });
  useDay.getState().mirrorCommitment(next);
}
