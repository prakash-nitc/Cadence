/**
 * Time actually worked in a block — SPEC §3.3.
 *
 * Closing a block used to answer one question, whether you stopped on time, and hours
 * targets read only the minutes typed into a commitment. So two hours spent in a Core CSE
 * block and closed with "Stopped on time" counted as nothing, and a three-hour block done
 * for two had no way to say so.
 *
 * Closing a work block now also records the minutes put in. Those minutes flow into the
 * block's minutes-typed commitments, which is what every hours target already reads, and
 * a block with no such commitment still carries its own time for the targets that name it.
 *
 * Pure. The clock is passed in.
 */
import type { CommitmentRecord } from '../db/schema';
import type { ScheduledBlock } from './layout';
import { statusForProgress } from './scoring';

/** The picker's step, and what a default is rounded to. */
export const WORKED_STEP = 15;

/** Past this a figure is a typo, not a block. */
export const WORKED_MAX = 16 * 60;

/**
 * A sensible first answer, which the user then confirms or corrects.
 *
 * Closed while the block is still running: the time since it started, because stopping
 * an hour into a three-hour block is exactly the partial case. Closed after it ended: the
 * whole block — whether they overran is the containment answer, and by how much is unknown.
 */
export function defaultWorked(block: ScheduledBlock, at: number): number {
  if (at >= block.endsAt) return block.minutes;
  const elapsed = Math.max(0, (at - block.startsAt) / 60_000);
  const rounded = Math.round(elapsed / WORKED_STEP) * WORKED_STEP;
  return Math.min(block.minutes, rounded);
}

export function clampWorked(minutes: number): number {
  return Math.min(WORKED_MAX, Math.max(0, Math.round(minutes)));
}

export function withWorked(
  blocks: ScheduledBlock[],
  blockId: string,
  minutes: number,
): ScheduledBlock[] {
  return blocks.map((block) =>
    block.blockId === blockId ? { ...block, workedMinutes: clampWorked(minutes) } : block,
  );
}

/** Minutes-typed, still standing, and attached to this block on this day. */
function takesTime(commitment: CommitmentRecord, date: string, blockId: string): boolean {
  return (
    commitment.dayDate === date &&
    commitment.blockId === blockId &&
    commitment.targetType === 'minutes' &&
    commitment.status !== 'skipped' &&
    commitment.status !== 'avoided' &&
    commitment.status !== 'displaced'
  );
}

/**
 * The block's minutes, written into the commitments that measure time.
 *
 * One commitment takes all of it. Several share it in proportion to their targets, with
 * the rounding remainder on the last so the parts always sum to what was logged. Count and
 * binary commitments are left alone: two hours says nothing about how many problems.
 *
 * Returns only the commitments that changed.
 */
export function spreadWorked(
  commitments: CommitmentRecord[],
  date: string,
  blockId: string,
  minutes: number,
): CommitmentRecord[] {
  const receiving = commitments.filter((commitment) => takesTime(commitment, date, blockId));
  if (receiving.length === 0) return [];

  const total = clampWorked(minutes);
  const weight = receiving.reduce((sum, commitment) => sum + Math.max(1, commitment.target), 0);

  let given = 0;
  const next = receiving.map((commitment, index) => {
    const share =
      index === receiving.length - 1
        ? total - given
        : Math.round((total * Math.max(1, commitment.target)) / weight);
    given += share;
    const updated = { ...commitment, done: share };
    return { ...updated, status: statusForProgress(updated) };
  });

  return next.filter((updated, index) => {
    const before = receiving[index];
    return !before || updated.done !== before.done || updated.status !== before.status;
  });
}

/**
 * Whether a block's own time is already represented by a commitment.
 *
 * If any standing minutes-typed commitment sits on the block, that commitment says what
 * the time was for, and the block's own figure must not be counted a second time.
 */
export function timeHeldByCommitment(
  commitments: CommitmentRecord[],
  date: string,
  blockId: string,
): boolean {
  return commitments.some(
    (commitment) =>
      commitment.dayDate === date &&
      commitment.blockId === blockId &&
      commitment.targetType === 'minutes' &&
      commitment.status !== 'displaced',
  );
}
