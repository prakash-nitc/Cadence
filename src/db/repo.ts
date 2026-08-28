/**
 * Every read and write goes through here. No component and no store touches Dexie
 * directly — CLAUDE.md rule 2.
 */
import { DEFAULT_PREFS } from '../config/schedule.config';
import type { Prefs } from '../lib/prefs';
import { dateKey } from '../lib/time';
import {
  db,
  type CommitmentRecord,
  type DayRecord,
  type LogRecord,
  type MilestoneProgress,
  type MonthTargetRecord,
  type PrefRecord,
  type TargetOverride,
  type SavedTemplate,
} from './schema';

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Load Settings, seeding any key that has never been written.
 *
 * This is the **only** place `DEFAULT_PREFS` is read. After first run the app reads
 * what is in the database — a config constant changing must never silently rewrite a
 * setting the user has since edited. A key absent from the table has never been seeded,
 * so seeding it here is still first-run behaviour for that key.
 */
export async function loadPrefs(): Promise<Prefs> {
  const stored = new Map((await db.prefs.toArray()).map((row) => [row.key, row.value]));
  const resolved: Record<string, unknown> = {};
  const toSeed: PrefRecord[] = [];

  for (const [key, fallback] of Object.entries(DEFAULT_PREFS)) {
    if (stored.has(key)) {
      resolved[key] = stored.get(key);
    } else {
      resolved[key] = fallback;
      toSeed.push({ key, value: fallback });
    }
  }

  if (toSeed.length > 0) await db.prefs.bulkPut(toSeed);
  return resolved as Prefs;
}

export async function savePref<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
  await db.prefs.put({ key: key as string, value });
}

// ─── Days ─────────────────────────────────────────────────────────────────────

export async function getDay(date: string): Promise<DayRecord | null> {
  return (await db.days.get(date)) ?? null;
}

export async function putDay(day: DayRecord): Promise<void> {
  await db.days.put(day);
}

export async function listDays(fromDate: string, toDate: string): Promise<DayRecord[]> {
  return db.days.where('date').between(fromDate, toDate, true, true).sortBy('date');
}

/**
 * Which day the app is currently in.
 *
 * Not simply today's date: a `lateNight` day anchored at 21:00 runs past midnight, and
 * at 00:30 the user is still working yesterday's day. Rolling them onto a fresh
 * unanchored day at midnight would throw away the run they are in the middle of.
 *
 * Yesterday wins only while its last boundary is still ahead of the clock and today has
 * not been anchored.
 */
export async function resolveActiveDate(now: number): Promise<string> {
  const today = dateKey(now);
  const todayRecord = await db.days.get(today);
  if (todayRecord?.anchorAt) return today;

  const yesterday = dateKey(now - 86_400_000);
  const record = await db.days.get(yesterday);
  if (!record?.anchorAt) return today;

  const lastEnd = record.blocks.reduce((latest, block) => Math.max(latest, block.endsAt), 0);
  return lastEnd > now ? yesterday : today;
}

// ─── Commitments ──────────────────────────────────────────────────────────────
// Written in session 3. Declared here so nothing is tempted to reach past the repo.

export async function commitmentsFor(dayDate: string): Promise<CommitmentRecord[]> {
  return db.commitments.where('dayDate').equals(dayDate).toArray();
}

export async function putCommitments(commitments: CommitmentRecord[]): Promise<void> {
  await db.commitments.bulkPut(commitments);
}

export async function deleteCommitment(id: string): Promise<void> {
  await db.commitments.delete(id);
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function getLog(date: string): Promise<LogRecord | null> {
  return (await db.logs.get(date)) ?? null;
}

export async function putLog(log: LogRecord): Promise<void> {
  await db.logs.put(log);
}

// ─── Saved templates ──────────────────────────────────────────────────────────

export async function listSavedTemplates(): Promise<SavedTemplate[]> {
  return db.savedTemplates.orderBy('createdAt').toArray();
}

export async function putSavedTemplate(template: SavedTemplate): Promise<void> {
  await db.savedTemplates.put(template);
}

export async function deleteSavedTemplate(id: string): Promise<void> {
  await db.savedTemplates.delete(id);
}

/** Every commitment on days in a range, inclusive. Used for history and carry-overs. */
export async function commitmentsBetween(
  fromDate: string,
  toDate: string,
): Promise<CommitmentRecord[]> {
  return db.commitments.where('dayDate').between(fromDate, toDate, true, true).toArray();
}

/**
 * Total logged against a tag across all time, counting only `count` targets.
 *
 * Drives "which DSA topic am I on" — config orders the topics and gives each a target
 * but no dates, so progress is the only honest way to say which one is current.
 * Filtered in memory: `tags` is an array, and a multi-entry index for one derived
 * number is not worth the schema.
 */
export async function countedDoneForTag(tag: string): Promise<number> {
  const all = await db.commitments.toArray();
  return all
    .filter((entry) => entry.targetType === 'count' && entry.tags.includes(tag))
    .reduce((sum, entry) => sum + entry.done, 0);
}

/** Replace a day's commitments wholesale — replanning is not appending. */
export async function replaceCommitments(
  dayDate: string,
  commitments: CommitmentRecord[],
): Promise<void> {
  await db.transaction('rw', db.commitments, async () => {
    await db.commitments.where('dayDate').equals(dayDate).delete();
    if (commitments.length > 0) await db.commitments.bulkPut(commitments);
  });
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export async function listMilestoneProgress(): Promise<MilestoneProgress[]> {
  return db.milestoneProgress.toArray();
}

export async function putMilestoneProgress(record: MilestoneProgress): Promise<void> {
  await db.milestoneProgress.put(record);
}

// ─── Logs over a range ────────────────────────────────────────────────────────

export async function logsBetween(fromDate: string, toDate: string): Promise<LogRecord[]> {
  return db.logs.where('date').between(fromDate, toDate, true, true).toArray();
}

// ─── Export and import ────────────────────────────────────────────────────────

export interface Backup {
  app: 'cadence';
  version: number;
  exportedAt: number;
  days: DayRecord[];
  commitments: CommitmentRecord[];
  logs: LogRecord[];
  savedTemplates: SavedTemplate[];
  prefs: PrefRecord[];
  milestoneProgress: MilestoneProgress[];
  monthTargets: MonthTargetRecord[];
  targetOverrides: TargetOverride[];
}

export const BACKUP_VERSION = 1;

/**
 * Everything, in one object — SPEC §0.4. The user version-controls his own history, and
 * it is never hostage to a browser profile.
 */
export async function exportAll(): Promise<Backup> {
  const [
    days, commitments, logs, savedTemplates, prefs, milestoneProgress, monthTargets, targetOverrides,
  ] =
    await Promise.all([
      db.days.toArray(),
      db.commitments.toArray(),
      db.logs.toArray(),
      db.savedTemplates.toArray(),
      db.prefs.toArray(),
      db.milestoneProgress.toArray(),
      db.monthTargets.toArray(),
      db.targetOverrides.toArray(),
    ]);

  return {
    app: 'cadence',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    days,
    commitments,
    logs,
    savedTemplates,
    prefs,
    milestoneProgress,
    monthTargets,
    targetOverrides,
  };
}

export function isBackup(value: unknown): value is Backup {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Backup>;
  return (
    candidate.app === 'cadence' &&
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.days) &&
    Array.isArray(candidate.commitments)
  );
}

/**
 * Replace everything with the contents of a backup.
 *
 * Destructive by design: importing half a history on top of another would leave a
 * database that is neither. One transaction, so a failure part-way leaves the existing
 * data alone rather than a half-replaced mess.
 */
export async function importAll(backup: Backup): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.days,
      db.commitments,
      db.logs,
      db.savedTemplates,
      db.prefs,
      db.milestoneProgress,
      db.monthTargets,
      db.targetOverrides,
    ],
    async () => {
      await Promise.all([
        db.days.clear(),
        db.commitments.clear(),
        db.logs.clear(),
        db.savedTemplates.clear(),
        db.prefs.clear(),
        db.milestoneProgress.clear(),
        db.monthTargets.clear(),
        db.targetOverrides.clear(),
      ]);

      await Promise.all([
        db.days.bulkPut(backup.days ?? []),
        db.commitments.bulkPut(backup.commitments ?? []),
        db.logs.bulkPut(backup.logs ?? []),
        db.savedTemplates.bulkPut(backup.savedTemplates ?? []),
        db.prefs.bulkPut(backup.prefs ?? []),
        db.milestoneProgress.bulkPut(backup.milestoneProgress ?? []),
        db.monthTargets.bulkPut(backup.monthTargets ?? []),
        db.targetOverrides.bulkPut(backup.targetOverrides ?? []),
      ]);
    },
  );
}

// ─── Monthly targets ──────────────────────────────────────────────────────────

export async function getMonthTargets(month: string): Promise<MonthTargetRecord | null> {
  return (await db.monthTargets.get(month)) ?? null;
}

export async function putMonthTargets(record: MonthTargetRecord): Promise<void> {
  await db.monthTargets.put(record);
}

// ─── Weekly target overrides ──────────────────────────────────────────────────

export async function listTargetOverrides(): Promise<TargetOverride[]> {
  return db.targetOverrides.orderBy('id').toArray();
}

export async function putTargetOverrides(overrides: TargetOverride[]): Promise<void> {
  await db.targetOverrides.bulkPut(overrides);
}

export async function deleteTargetOverride(id: string): Promise<void> {
  await db.targetOverrides.delete(id);
}
