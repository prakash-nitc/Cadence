/**
 * What tags exist, what they count toward, and which ones a block implies.
 *
 * Tags drive the weekly targets, but nothing on screen used to say so: you had to know
 * that "New DSA problems" counts commitments tagged `dsa_new`, type them exactly, and
 * find out days later on Progress if you had not. All of that is derivable from config,
 * so it is derived here rather than remembered.
 *
 * Everything reads `schedule.config.ts`. Swap the roadmap and this follows it.
 */
import {
  COMMITMENT_PRESETS,
  WEEKLY_TARGETS,
  type WeeklyTarget,
} from '../config/schedule.config';
import type { TargetType } from '../db/schema';

export interface TagInfo {
  tag: string;
  /** Weekly targets this tag can feed, by label. Empty means it counts toward nothing. */
  targets: string[];
}

/**
 * Which weekly targets a set of tags actually counts toward.
 *
 * The target type matters and is easy to get wrong: a commitment tagged `spring` counts
 * toward Spring Boot hours only if it measures minutes. Tagged `spring` but counted in
 * problems, it counts toward nothing — so that is said rather than left to be discovered.
 */
export function countsToward(
  tags: string[],
  targetType: TargetType,
  targets: WeeklyTarget[] = WEEKLY_TARGETS,
): string[] {
  return targets.filter((target) => {
    const source = target.source;
    if (!source) return false;

    switch (source.kind) {
      case 'countTag':
        return targetType === 'count' && tags.includes(source.tag);
      case 'minutesTag':
        return targetType === 'minutes' && tags.includes(source.tag);
      case 'daysTag':
        return tags.includes(source.tag);
      default:
        // Measured from blocks or logs, never from a commitment's tags.
        return false;
    }
  }).map((target) => target.label);
}

/** Every tag the roadmap knows about, in the order the targets declare them. */
export function knownTags(targets: WeeklyTarget[] = WEEKLY_TARGETS): TagInfo[] {
  const seen = new Map<string, TagInfo>();

  const add = (tag: string): TagInfo => {
    const existing = seen.get(tag);
    if (existing) return existing;
    const info: TagInfo = { tag, targets: [] };
    seen.set(tag, info);
    return info;
  };

  for (const target of targets) {
    const source = target.source;
    if (!source || !('tag' in source)) continue;
    add(source.tag).targets.push(target.label);
  }

  // Tags the presets use that no target measures — still real, just not counted.
  for (const preset of COMMITMENT_PRESETS) {
    for (const tag of preset.tags) add(tag);
  }

  return [...seen.values()];
}

/**
 * The tags a commitment on this block should start with.
 *
 * A commitment added to the DSA block is a DSA commitment; making the user say so again
 * is the kind of friction that quietly stops the weekly targets from working.
 */
export function defaultTagsForBlock(blockId: string | null): string[] {
  if (!blockId) return [];
  const preset = COMMITMENT_PRESETS.find((entry) => entry.blockId === blockId);
  return preset ? [...preset.tags] : [];
}

/** The target type a block's preset expects, so the form can default to it too. */
export function defaultTargetTypeForBlock(blockId: string | null): TargetType | null {
  if (!blockId) return null;
  return COMMITMENT_PRESETS.find((entry) => entry.blockId === blockId)?.targetType ?? null;
}
