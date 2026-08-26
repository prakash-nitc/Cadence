/**
 * Boundary mechanics — SPEC §2.3.
 *
 * After Start day, boundaries do not move on their own. Finishing early does not pull
 * the next block up; skipping leaves a hole; overrunning is recorded, not accommodated.
 * The only things that move a boundary are `pushRemaining` and `pullForward`, and both
 * are explicit user actions that get logged.
 *
 * Pure. The clock is passed in as `now` (epoch ms) — nothing here reads it.
 */
import type { ScheduledBlock } from './layout';

/**
 * What a block looks like right now.
 *
 * `awaiting` is the unresolved state: the block's end time has passed and the user has
 * not said whether they stopped. It is deliberately not `contained` (the app will not
 * award containment nobody confirmed) and deliberately not yet `overran` (the user may
 * well have stopped on time and simply not tapped). The containment prompt resolves it;
 * an unanswered block settles as `overran` at day close.
 */
export type BlockView = 'pending' | 'active' | 'awaiting' | 'contained' | 'overran' | 'skipped';

export const RESOLVED: readonly BlockView[] = ['contained', 'overran', 'skipped'];

export function isResolved(block: ScheduledBlock): boolean {
  return block.status === 'contained' || block.status === 'overran' || block.status === 'skipped';
}

/** Gaps are unallocated time. They are never actionable and never scored. */
export function isActionable(block: ScheduledBlock): boolean {
  return block.kind !== 'gap';
}

export function viewStatus(block: ScheduledBlock, now: number): BlockView {
  if (isResolved(block)) return block.status as BlockView;
  if (now < block.startsAt) return 'pending';
  if (now < block.endsAt) return 'active';
  return 'awaiting';
}

/** The block whose window contains `now`, resolved or not. Gaps included. */
export function blockAt(blocks: ScheduledBlock[], now: number): ScheduledBlock | null {
  return blocks.find((block) => now >= block.startsAt && now < block.endsAt) ?? null;
}

/** The next block that has not started. Used for the one-line "next" on Now. */
export function nextBlock(blocks: ScheduledBlock[], now: number): ScheduledBlock | null {
  return blocks.find((block) => block.startsAt > now && isActionable(block)) ?? null;
}

/**
 * Blocks whose time is up and whose containment the user has not answered.
 * Oldest first — the prompt works through them in order.
 */
export function unconfirmed(blocks: ScheduledBlock[], now: number): ScheduledBlock[] {
  return blocks.filter(
    (block) => isActionable(block) && !isResolved(block) && block.endsAt <= now,
  );
}

/**
 * Minutes of free time between finishing early and the next boundary.
 * Zero when the current block is still running — SPEC shows this honestly rather than
 * closing the hole.
 */
export function freeMinutesUntilNext(blocks: ScheduledBlock[], now: number): number {
  const next = nextBlock(blocks, now);
  if (!next) return 0;
  return Math.max(0, Math.round((next.startsAt - now) / 60_000));
}

/** True once every actionable block is resolved. */
export function isDayComplete(blocks: ScheduledBlock[]): boolean {
  return blocks.filter(isActionable).every(isResolved);
}

function shift(block: ScheduledBlock, minutes: number): ScheduledBlock {
  const delta = minutes * 60_000;
  return { ...block, startsAt: block.startsAt + delta, endsAt: block.endsAt + delta };
}

/**
 * `Push remaining by N` — SPEC §2.3.
 *
 * The block in progress gains the time; every boundary after it moves later by the same
 * amount. Explicit, logged, and counted: how often this gets used is itself a metric.
 *
 * With no block in progress, everything still to come simply moves later.
 */
export function pushRemaining(
  blocks: ScheduledBlock[],
  now: number,
  minutes: number,
): ScheduledBlock[] {
  const delta = minutes * 60_000;
  const currentIndex = blocks.findIndex(
    (block) => now >= block.startsAt && now < block.endsAt && !isResolved(block),
  );

  if (currentIndex === -1) {
    return blocks.map((block) =>
      block.startsAt > now && !isResolved(block) ? shift(block, minutes) : block,
    );
  }

  return blocks.map((block, index) => {
    if (index < currentIndex) return block;
    if (index === currentIndex) {
      return { ...block, endsAt: block.endsAt + delta, minutes: block.minutes + minutes };
    }
    return shift(block, minutes);
  });
}

/**
 * `Start next block early` — SPEC §2.3.
 *
 * Moves every remaining boundary earlier by `minutes`. The default answer to this is no:
 * the UI warns before calling it, because pulling the day forward is how a schedule
 * quietly stops meaning anything.
 */
export function pullForward(
  blocks: ScheduledBlock[],
  now: number,
  minutes: number,
): ScheduledBlock[] {
  if (minutes <= 0) return blocks;
  return blocks.map((block) =>
    block.startsAt >= now && !isResolved(block) ? shift(block, -minutes) : block,
  );
}

/** Close a block with an outcome the user actually chose. */
export function resolveBlock(
  blocks: ScheduledBlock[],
  blockId: string,
  status: 'contained' | 'overran' | 'skipped',
  at: number,
): ScheduledBlock[] {
  return blocks.map((block) =>
    block.blockId === blockId
      ? { ...block, status, actualEndedAt: status === 'skipped' ? block.endsAt : at }
      : block,
  );
}

export interface ContainmentTally {
  contained: number;
  total: number;
  /** Null until at least one block has been resolved — no denominator, no percentage. */
  percent: number | null;
}

/**
 * Containment is tracked separately from the day score — SPEC §3.3. It measures whether
 * boundaries were respected, not whether the work got done. Skipped blocks count against
 * it: a boundary you never turned up for was not contained.
 */
export function containment(blocks: ScheduledBlock[]): ContainmentTally {
  const resolved = blocks.filter((block) => isActionable(block) && isResolved(block));
  const contained = resolved.filter((block) => block.status === 'contained').length;
  return {
    contained,
    total: resolved.length,
    percent: resolved.length === 0 ? null : Math.round((contained / resolved.length) * 100),
  };
}

/**
 * Which corrections a resolved block will accept — SPEC §3.2.
 *
 * Tapping a past block allows honest correction, but there is no control that converts
 * a skip into a containment. Generalised: a correction may only move a block to an
 * equal-or-worse outcome. Contained can become overran or skipped, overran can become
 * skipped, and a skip is final.
 *
 * This is Rule 10 enforced by the interface rather than asked for politely — the app
 * does not offer a convenient way to lie to it.
 */
export function allowedCorrections(
  status: ScheduledBlock['status'],
): ('contained' | 'overran' | 'skipped')[] {
  switch (status) {
    case 'contained':
      return ['overran', 'skipped'];
    case 'overran':
      return ['skipped'];
    default:
      return [];
  }
}
