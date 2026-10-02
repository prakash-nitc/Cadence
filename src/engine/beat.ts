/**
 * Beat yesterday — SPEC §3.1.
 *
 * One comparison against your own last day, in time worked: the minutes answered when each
 * work block closed, or the timer's running count for a block still open. It moves while
 * you work, which is the point — a number that only changes when a block closes cannot be
 * chased.
 *
 * Unanswered blocks count nothing — see `workedOn`.
 *
 * Deliberately time worked rather than Progress's focused minutes (earned from commitments).
 * Earned minutes answer "how much landed"; this answers "how long did I put in", and it is
 * the one of the two you can push on minute by minute.
 *
 * Pure. The clock is passed in.
 */
import type { DayRecord } from '../db/schema';
import { isResolved } from './boundaries';
import { hasTimer, timedMinutes } from './timer';

/**
 * Minutes worked across a day's work blocks, as of `now`.
 *
 * Only blocks that were answered for count, plus the one running right now. The timer starts
 * itself whenever a work block is running and the app is open, so a block nobody worked and
 * nobody ticked would otherwise hand over its whole length — a day spent away from the desk
 * reading as a full day's work. Work is never assumed: the answer at the block's close is
 * what makes its time real. The running block is the exception, counted live so the figure
 * moves while you work; it firms up, or disappears, when you answer for it.
 */
export function workedOn(day: DayRecord | null, now: number): number {
  if (!day) return 0;
  return day.blocks.reduce((sum, block) => {
    if (block.kind !== 'work') return sum;
    if (block.workedMinutes !== undefined) return sum + block.workedMinutes;
    const running = now >= block.startsAt && now < block.endsAt && !isResolved(block);
    if (running && hasTimer(block)) return sum + timedMinutes(block, now);
    return sum;
  }, 0);
}

export interface BeatYesterday {
  today: number;
  yesterday: number;
  /** Minutes still needed to pass yesterday. Zero once passed. */
  toGo: number;
  /** Minutes past yesterday. Zero until passed. */
  ahead: number;
  /** Yesterday has a figure worth racing. */
  hasYesterday: boolean;
}

export function beatYesterday(
  today: DayRecord | null,
  yesterday: DayRecord | null,
  now: number,
): BeatYesterday {
  const done = Math.round(workedOn(today, now));
  const target = Math.round(workedOn(yesterday, now));
  return {
    today: done,
    yesterday: target,
    toGo: Math.max(0, target - done),
    ahead: target > 0 ? Math.max(0, done - target) : 0,
    hasYesterday: target > 0,
  };
}
