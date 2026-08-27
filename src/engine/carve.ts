/**
 * Quick carve — SPEC §2.6. "I have N hours today."
 *
 * Fills N with protected work in priority order and states what did not fit.
 *
 * Three passes, deliberately.
 *
 *   1. Every protected and compressible block that can fit gets its floor.
 *   2. Those same blocks are topped back up toward full length.
 *   3. Only then do droppable blocks get whatever is left.
 *
 * A single greedy pass would let the DSA block swallow a four-hour day whole and push
 * Spring Boot out entirely — the opposite of what protection is for, since §2.4
 * compresses to floors before it drops anything.
 *
 * Droppable blocks are held back to the last pass rather than taking a floor with
 * everyone else, because a block with no `minMinutes` has no floor to speak of: its
 * floor is its whole length. Letting flex claim ninety uncompressible minutes ahead of
 * topping the DSA block back up would invert the priority order it is meant to respect.
 *
 * Pure: no I/O, no clock.
 */
import type { BlockDef, Priority } from '../config/schedule.config';

export interface Carve {
  blocks: BlockDef[];
  /** Work blocks that did not fit at all, in template order. */
  notFitted: BlockDef[];
  availableMinutes: number;
  usedMinutes: number;
}

const floorOf = (block: BlockDef): number => block.minMinutes ?? block.minutes;

/**
 * Carve `availableMinutes` out of a template.
 *
 * Work blocks only: "I have four hours" means four hours at the desk, not four hours
 * that include lunch. Meals and routines are not part of a carve.
 */
export function carve(template: BlockDef[], availableMinutes: number): Carve {
  const work = template.filter((block) => block.kind === 'work');

  const byProtection = work
    .map((block, index) => ({ block, index }))
    .sort((a, b) => {
      const byPriority = (a.block.priority as Priority) - (b.block.priority as Priority);
      return byPriority !== 0 ? byPriority : a.index - b.index;
    });

  const allocated = new Map<string, number>();
  let remaining = Math.max(0, availableMinutes);

  const protectedWork = byProtection.filter(({ block }) => block.priority < 2);
  const droppable = byProtection.filter(({ block }) => block.priority >= 2);

  // Pass one: every protected block that can fit gets its floor.
  for (const { block } of protectedWork) {
    const floor = floorOf(block);
    if (floor > remaining) continue;
    allocated.set(block.id, floor);
    remaining -= floor;
  }

  // Pass two: top those back up toward full length, still most protected first.
  for (const { block } of protectedWork) {
    if (remaining <= 0) break;
    const current = allocated.get(block.id);
    if (current === undefined) continue;

    const take = Math.min(block.minutes - current, remaining);
    if (take <= 0) continue;
    allocated.set(block.id, current + take);
    remaining -= take;
  }

  // Pass three: droppable work takes whatever survived.
  for (const { block } of droppable) {
    const floor = floorOf(block);
    if (floor > remaining) continue;
    allocated.set(block.id, floor);
    remaining -= floor;
  }

  const blocks = work
    .filter((block) => allocated.has(block.id))
    .map((block) => ({ ...block, minutes: allocated.get(block.id) ?? block.minutes }));

  return {
    blocks,
    notFitted: work.filter((block) => !allocated.has(block.id)),
    availableMinutes: Math.max(0, availableMinutes),
    usedMinutes: blocks.reduce((sum, block) => sum + block.minutes, 0),
  };
}
