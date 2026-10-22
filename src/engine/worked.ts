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
import { completionOf, statusForProgress } from './scoring';
import { hasTimer, timedMinutes, timerLeadIn } from './timer';

/** The picker's step, and what a default is rounded to. */
export const WORKED_STEP = 15;

/** Past this a figure is a typo, not a block. */
export const WORKED_MAX = 16 * 60;

/**
 * A sensible first answer, which the user then confirms or corrects.
 *
 * Timed: what the timer counted, plus any time before it started. Untimed and closed while
 * still running: the time since it started, because stopping an hour into a three-hour block
 * is exactly the partial case. Untimed and closed after it ended: the whole block — whether
 * they overran is the containment answer, and by how much is unknown.
 */
export function defaultWorked(block: ScheduledBlock, at: number): number {
  // Measured beats guessed. A timer that began late — the app opened mid-block — cannot know
  // about the time before it, so that lead-in is offered too, as the untimed guess would.
  // Pauses and absence inside the timer's life stay out.
  if (hasTimer(block)) return Math.round(timedMinutes(block, at) + timerLeadIn(block));
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

/**
 * Minutes each commitment stands for, in time actually put in — SPEC §3.3.
 *
 * Hours used to be estimated from the plan: a commitment's planned minutes times the share
 * of it finished. Two of four problems on a four-hour plan read as two hours whether the
 * block was worked for one hour or five, and the answer to "how long did you work" changed
 * nothing. Where a block was answered for, that answer is the time:
 *
 * - minutes commitments hold their `done`, which the answer was written into;
 * - count and done-or-not commitments share the block's answer by planned minutes, unless a
 *   minutes commitment on the block already holds it — then it is not counted twice;
 * - anything on a block nobody answered for, or on no block, keeps the old estimate — there
 *   is nothing better to go on, and a record from before this existed reads as it always has.
 *
 * Displaced work happened elsewhere and stands for nothing. Scoring does not read this: the
 * day's score judges what was finished, not how long it took.
 */
export function minutesPutIn(
  commitments: CommitmentRecord[],
  days: { date: string; blocks: ScheduledBlock[] }[],
): Map<string, number> {
  const blocksOn = new Map(days.map((day) => [day.date, day.blocks]));
  const standing = commitments.filter((commitment) => commitment.status !== 'displaced');

  const sharing = (date: string, blockId: string): CommitmentRecord[] =>
    standing.filter(
      (commitment) =>
        commitment.dayDate === date &&
        commitment.blockId === blockId &&
        commitment.targetType !== 'minutes',
    );

  const out = new Map<string, number>();
  for (const commitment of standing) {
    const block = commitment.blockId
      ? blocksOn.get(commitment.dayDate)?.find((entry) => entry.blockId === commitment.blockId)
      : undefined;
    const answered = block?.workedMinutes;

    if (answered === undefined) {
      out.set(commitment.id, commitment.plannedMinutes * completionOf(commitment));
      continue;
    }
    if (commitment.targetType === 'minutes') {
      out.set(commitment.id, commitment.done);
      continue;
    }
    if (timeHeldByCommitment(commitments, commitment.dayDate, commitment.blockId ?? '')) {
      out.set(commitment.id, 0);
      continue;
    }

    const others = sharing(commitment.dayDate, commitment.blockId ?? '');
    const weight = others.reduce((sum, entry) => sum + Math.max(0, entry.plannedMinutes), 0);
    out.set(
      commitment.id,
      weight > 0
        ? (answered * Math.max(0, commitment.plannedMinutes)) / weight
        : answered / Math.max(1, others.length),
    );
  }
  return out;
}
