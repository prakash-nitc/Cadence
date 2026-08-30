/**
 * The small amount of joining-up between a laid day and the commitments on it.
 *
 * Kept out of `engine/scoring.ts` so scoring stays a function of commitments and prefs
 * alone, and out of the screens so Now and Day cannot drift apart on what "passed" or
 * "runway" mean.
 */
import type { CommitmentRecord } from '../db/schema';
import { isResolved } from '../engine/boundaries';
import type { ScheduledBlock } from '../engine/layout';

/**
 * Whether a block's chance has gone: its end time has passed, or it was closed early.
 *
 * A commitment attached to nothing has no deadline inside the day, so it never counts as
 * passed — it stays winnable until the day itself runs out.
 */
export function blockPassed(
  blocks: ScheduledBlock[],
  now: number,
): (blockId: string | null) => boolean {
  const passed = new Set(
    blocks
      .filter((block) => isResolved(block) || block.endsAt <= now)
      .map((block) => block.blockId),
  );
  return (blockId) => (blockId === null ? false : passed.has(blockId));
}

/** Block priority for triage order. An unattached commitment is the least protected. */
export function blockPriority(
  blocks: ScheduledBlock[],
): (blockId: string | null) => number {
  const priorities = new Map(blocks.map((block) => [block.blockId, block.priority as number]));
  return (blockId) => (blockId === null ? 3 : (priorities.get(blockId) ?? 3));
}

/** Minutes of day left to run: now to the day's last boundary, pushes included. */
export function runwayMinutes(blocks: ScheduledBlock[], now: number): number {
  const lastEnd = blocks.reduce((latest, block) => Math.max(latest, block.endsAt), 0);
  return Math.max(0, Math.round((lastEnd - now) / 60_000));
}

/**
 * Turn a failed non-negotiable key into something readable. The key is a tag or a block
 * id, so the commitment it refers to carries the only human label there is.
 */
export function gateLabel(
  commitments: CommitmentRecord[],
  blocks: ScheduledBlock[],
): (key: string) => string {
  return (key) => {
    const commitment = commitments.find(
      (entry) => entry.tags.includes(key) || entry.blockId === key,
    );
    if (commitment) return commitment.label;

    const block = blocks.find((entry) => entry.blockId === key);
    return block ? block.label : key;
  };
}

/**
 * Commitments with no slot in the laid day.
 *
 * Either never attached to a block, or attached to one that a re-lay dropped. Both count
 * toward the score and the burn-down in full, so both have to be visible: a commitment
 * that appears only in the totals is a number with no way to check it, and re-laying a
 * day is the ordinary way to end up with one.
 */
export function unslotted<T extends { blockId: string | null }>(
  commitments: T[],
  blocks: ScheduledBlock[],
): T[] {
  const laid = new Set(blocks.map((block) => block.blockId));
  return commitments.filter(
    (commitment) => commitment.blockId === null || !laid.has(commitment.blockId),
  );
}
