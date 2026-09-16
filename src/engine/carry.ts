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
}

/**
 * The carry-over pool.
 *
 * Undone commitments from days already gone. One line per lineage: if the same work has
 * been carried three times, only the most recent copy is offered, and its `movedCount` is
 * what the badge reads. A night of skipped planning does not lose the pool — anything
 * still open from earlier days is still in it.
 */
export function carryOverPool(
  past: CommitmentRecord[],
  planDate: string,
  presets: RoutineShape[],
): CarryPool {
  const undone = past.filter(
    (commitment) =>
      commitment.dayDate < planDate &&
      // Retired work is not undone work. Deleting it from a plan has to mean it stops
      // coming back, or "delete" is just a slower way of unticking.
      !commitment.retiredAt &&
      (commitment.status === 'open' || commitment.status === 'partial'),
  );

  const oneOff = undone.filter((commitment) => !isRoutine(commitment, presets));

  // A lineage is the work, not the day it started: two commitments first planned on the
  // same date are different lineages, so the label has to be part of the key.
  const lineageOf = (commitment: CommitmentRecord): string =>
    `${commitment.originDate}|${commitment.label}`;

  const latestPerLineage = new Map<string, CommitmentRecord>();
  for (const commitment of oneOff) {
    const existing = latestPerLineage.get(lineageOf(commitment));
    if (!existing || commitment.dayDate > existing.dayDate) {
      latestPerLineage.set(lineageOf(commitment), commitment);
    }
  }

  return {
    carry: [...latestPerLineage.values()].sort((a, b) => b.movedCount - a.movedCount),
    routineLeftShort: undone.length - oneOff.length,
  };
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
