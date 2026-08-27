/**
 * Dexie schema — SPEC §5.
 *
 * Config (timetable, subjects, milestones, weekly targets, rules) is NOT in here. It
 * lives in `schedule.config.ts` as typed constants. This database holds what the user
 * did, plus Settings.
 */
import Dexie, { type Table } from 'dexie';
import type { BlockDef } from '../config/schedule.config';
import type { ScheduledBlock } from '../engine/layout';

export type Band = 'green' | 'yellow' | 'red';
export type TargetType = 'count' | 'binary' | 'minutes';
export type CommitmentStatus =
  | 'open'
  | 'complete'
  | 'partial'
  | 'skipped'
  | 'avoided'
  | 'displaced';

export interface Push {
  at: number;
  minutes: number;
}

export interface DayRecord {
  /** 'YYYY-MM-DD', primary key. The anchor's calendar date, not the clock's. */
  date: string;
  anchorAt: number | null;
  /** TemplateId, or a saved-template id. */
  template: string;
  blocks: ScheduledBlock[];
  /** Human-readable cut lines from degradation, as shown at Start day. */
  degradation: string[];
  pushes: Push[];
  placementMode: boolean;
  /** Computed at day close. */
  score: number | null;
  band: Band | null;
  gatePassed: boolean | null;
  /** Null means the day was never planned, which is red regardless — SPEC §4.1. */
  plannedAt: number | null;
  /**
   * The arrangement decided the night before, if there was one. Held as durations, so
   * it lays out from whatever the real anchor turns out to be.
   */
  plannedBlocks: BlockDef[] | null;
  /**
   * The wake time the plan assumed, 'HH:mm'. A planning assumption, not the anchor —
   * SPEC §2.1 is clear that the anchor is when Start day is actually tapped. This only
   * seeds the picker and lets the plan show real clock times while it is being made.
   */
  plannedAnchor: string | null;
}

export interface CommitmentRecord {
  id: string;
  dayDate: string;
  blockId: string | null;
  label: string;
  targetType: TargetType;
  target: number;
  done: number;
  plannedMinutes: number;
  tags: string[];
  status: CommitmentStatus;
  displacedBy: string | null;
  movedCount: number;
  /** First date it was planned. Drives movedCount and avoidance detection. */
  originDate: string;
}

export interface LogRecord {
  date: string;
  recallDrillDone: boolean;
  sleepHours: number;
  energy: 1 | 2 | 3 | 4 | 5;
  hardestThing: string;
  blocksContained: number;
  blocksTotal: number;
  createdAt: number;
}

export interface SavedTemplate {
  id: string;
  name: string;
  blocks: BlockDef[];
  createdAt: number;
}

export interface PrefRecord {
  key: string;
  value: unknown;
}

/**
 * Which milestone sub-items have been ticked — SPEC §4.4.
 *
 * The milestones themselves are config; only the ticking is user data. Keyed by
 * `date|label` so a roadmap swap does not silently inherit the last one's progress.
 */
export interface MilestoneProgress {
  key: string;
  checked: string[];
  doneAt: number | null;
}

export class CadenceDB extends Dexie {
  days!: Table<DayRecord, string>;
  commitments!: Table<CommitmentRecord, string>;
  logs!: Table<LogRecord, string>;
  savedTemplates!: Table<SavedTemplate, string>;
  prefs!: Table<PrefRecord, string>;
  milestoneProgress!: Table<MilestoneProgress, string>;

  constructor() {
    super('cadence');
    this.version(1).stores({
      days: 'date, plannedAt',
      commitments: 'id, dayDate, [dayDate+blockId], status, originDate',
      logs: 'date',
      savedTemplates: 'id, createdAt',
      prefs: 'key',
    });

    this.version(2).stores({
      milestoneProgress: 'key',
    });

    // Days gain a planned arrangement. Existing rows simply have neither field.
    this.version(3).stores({});
  }
}

export const db = new CadenceDB();
