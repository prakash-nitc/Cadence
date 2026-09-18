/**
 * What carries into tomorrow's plan — SPEC §4.1.
 *
 * Every unfinished commitment used to carry, as its own line, for two weeks. Daily work is
 * suggested fresh every night, so a week of Spring Boot sessions each left a little short
 * became seven Spring Boot lines on top of tomorrow's own, all pre-ticked — thirty-odd rows
 * with the one real unfinished task somewhere in the middle.
 *
 * Routine work does not carry. Tomorrow already has its own session of it, and the time it
 * fell short by is not lost: it counts against the week's hours and problem targets, which
 * is where a shortfall in recurring work belongs. Only one-off work carries — something
 * added by hand, which nothing else will ever offer again.
 *
 * Pure. The roadmap presets are passed in.
 */
import type { CommitmentRecord, TargetType } from '../db/schema';

/** The parts of a roadmap preset that identify a routine commitment. */
export interface RoutineShape {
  blockId: string;
  targetType: TargetType;
  tags: string[];
}

const sameTags = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((tag) => b.includes(tag));

/**
 * Whether a commitment is the roadmap's daily work rather than a one-off.
 *
 * Recorded when the commitment is created. Commitments from before that field existed are
 * judged by their shape instead: on a preset's block, of its type, with its tags. That can
 * misjudge an old hand-added task that happens to match a preset exactly — it stops
 * carrying, and the week's targets still count its time.
 */
export function isRoutine(commitment: CommitmentRecord, presets: RoutineShape[]): boolean {
  if (commitment.routine !== undefined) return commitment.routine;
  return presets.some(
    (preset) =>
      preset.blockId === commitment.blockId &&
      preset.targetType === commitment.targetType &&
      sameTags(preset.tags, commitment.tags),
  );
}

export interface CarryPool {
  /** One-off work still open, one line per piece of work, most-moved first. */
  carry: CommitmentRecord[];
  /** Routine commitments left short on earlier days, which are not carried. */
  routineLeftShort: number;
  /** Leftovers not picked up within `LEFTOVER_DAYS`, which have let themselves go. */
  letGo: number;
}

/**
 * How long a leftover waits to be picked up before it lets itself go.
 *
 * Leftovers are offered, never pushed: nothing enters a plan unless it is chosen. Something
 * left unchosen for a week has been answered, and keeping it on screen after that is the
 * pile this replaced.
 */
export const LEFTOVER_DAYS = 7;

/** A name as a person means it: case, outer spaces and doubled spaces do not matter. */
export function sameName(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** A piece of work across the days it was carried: where it started, and what it is. */
const lineageOf = (commitment: CommitmentRecord): string =>
  `${commitment.originDate}|${sameName(commitment.label)}`;

const daysBefore = (date: string, days: number): string => {
  const at = new Date(`${date}T12:00:00`);
  at.setDate(at.getDate() - days);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};

/**
 * The leftovers — SPEC §4.1.
 *
 * One-off work from days already gone whose latest copy is still unfinished. The latest copy
 * decides: a task carried from Monday and finished on Tuesday is finished, even though
 * Monday's copy was never ticked. (Judging each copy alone offered Monday's again — part of
 * how the pile grew.) Retired work never returns, and a leftover whose latest day is more
 * than `LEFTOVER_DAYS` old has let itself go.
 */
export function carryOverPool(
  past: CommitmentRecord[],
  planDate: string,
  presets: RoutineShape[],
  maxAgeDays = LEFTOVER_DAYS,
): CarryPool {
  const earlier = past.filter((commitment) => commitment.dayDate < planDate);
  const unfinished = (commitment: CommitmentRecord): boolean =>
    commitment.status === 'open' || commitment.status === 'partial';

  const routineLeftShort = earlier.filter(
    (commitment) =>
      !commitment.retiredAt && unfinished(commitment) && isRoutine(commitment, presets),
  ).length;

  const latestPerLineage = new Map<string, CommitmentRecord>();
  for (const commitment of earlier) {
    if (isRoutine(commitment, presets)) continue;
    const existing = latestPerLineage.get(lineageOf(commitment));
    if (!existing || commitment.dayDate > existing.dayDate) {
      latestPerLineage.set(lineageOf(commitment), commitment);
    }
  }

  const oldest = daysBefore(planDate, maxAgeDays);
  const waiting = [...latestPerLineage.values()].filter(
    // Retired work is not undone work: dropping it has to mean it stops coming back.
    (commitment) => !commitment.retiredAt && unfinished(commitment),
  );

  return {
    carry: waiting
      .filter((commitment) => commitment.dayDate >= oldest)
      .sort((a, b) => b.movedCount - a.movedCount || b.dayDate.localeCompare(a.dayDate)),
    routineLeftShort,
    letGo: waiting.filter((commitment) => commitment.dayDate < oldest).length,
  };
}

/** The leftover a newly added commitment continues, if its name is the same. */
export function findLeftover(
  pool: CommitmentRecord[],
  label: string,
): CommitmentRecord | null {
  const wanted = sameName(label);
  return pool.find((commitment) => sameName(commitment.label) === wanted) ?? null;
}

/**
 * The weight a commitment scores at — SPEC §4.1.
 *
 * For minutes, the target already is the time, so the weight is the target and there is
 * nothing separate to set; two fields holding the same number was the confusion. Count
 * and done-or-not commitments measure something other than time, so how long they take
 * is still their own figure.
 */
export function weightFor(
  targetType: TargetType,
  target: number,
  plannedMinutes: number,
): number {
  return targetType === 'minutes' ? Math.max(0, target) : Math.max(0, plannedMinutes);
}
