/**
 * The weekly targets, as the app actually uses them.
 *
 * `schedule.config.ts` declares the roadmap's targets. This layer applies whatever the
 * user has since changed — a rename, a different number, a target hidden or added — and
 * hands back the resolved list.
 *
 * The same pattern as monthly targets and as `DEFAULT_PREFS`: config seeds, the database
 * holds only what departs from it. A roadmap swap still moves every target the user has
 * not touched, which is the whole reason the split exists.
 */
import { WEEKLY_TARGETS, type TargetSource, type WeeklyTarget } from '../config/schedule.config';
import type { TargetOverride } from '../db/schema';

/** The ways a user-added target can be counted. Block and log sources stay internal. */
export const CUSTOM_SOURCE_KINDS = ['countTag', 'minutesTag', 'earnedMinutesTag', 'daysTag'] as const;
export type CustomSourceKind = (typeof CUSTOM_SOURCE_KINDS)[number];

export const SOURCE_LABEL: Record<CustomSourceKind, string> = {
  countTag: 'Count them',
  minutesTag: 'Add up minutes',
  earnedMinutesTag: 'Hours put in',
  daysTag: 'Days it was done',
};

export function resolveTargets(overrides: TargetOverride[]): WeeklyTarget[] {
  const byId = new Map(overrides.map((entry) => [entry.id, entry]));

  const fromConfig: WeeklyTarget[] = WEEKLY_TARGETS.filter(
    (target) => !byId.get(target.id)?.hidden,
  ).map((target) => {
    const override = byId.get(target.id);
    if (!override) return target;

    return {
      ...target,
      label: override.label ?? target.label,
      min: override.min ?? target.min,
      ...(override.max ?? target.max ?? null) !== null
        ? { max: (override.max ?? target.max) as number }
        : {},
      ...(override.warnBelow ?? target.warnBelow ?? null) !== null
        ? { warnBelow: (override.warnBelow ?? target.warnBelow) as number }
        : {},
    };
  });

  const configIds = new Set(WEEKLY_TARGETS.map((target) => target.id));

  const added: WeeklyTarget[] = overrides
    .filter((entry) => entry.custom !== null && !entry.hidden && !configIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      label: entry.label ?? entry.id,
      min: entry.min ?? 1,
      ...(entry.max === null ? {} : { max: entry.max }),
      unit: entry.custom?.unit ?? 'units',
      ...(entry.warnBelow === null ? {} : { warnBelow: entry.warnBelow }),
      ...(entry.custom ? { source: entry.custom.source } : {}),
    }));

  /**
   * Config order is authoritative for config targets, and a stored position is only used
   * for targets the user invented. An override records a position at the moment it is
   * written; letting that win would shuffle an edited target whenever the roadmap gained
   * a new one above it.
   */
  const orderOf = (target: WeeklyTarget): number => {
    const inConfig = WEEKLY_TARGETS.findIndex((entry) => entry.id === target.id);
    if (inConfig !== -1) return inConfig;
    return byId.get(target.id)?.order ?? Number.MAX_SAFE_INTEGER;
  };

  return [...fromConfig, ...added].sort((a, b) => orderOf(a) - orderOf(b));
}

/** A blank override for a config target, so editing one is a small change not a rewrite. */
export function blankOverride(id: string, order: number): TargetOverride {
  return { id, label: null, min: null, max: null, warnBelow: null, hidden: false, custom: null, order };
}

/** A target the user has invented. */
export function customTarget(
  label: string,
  unit: string,
  min: number,
  tag: string,
  kind: CustomSourceKind,
  order: number,
): TargetOverride {
  const source: TargetSource =
    kind === 'countTag'
      ? { kind: 'countTag', tag }
      : kind === 'minutesTag'
        ? { kind: 'minutesTag', tag }
        : kind === 'earnedMinutesTag'
          ? { kind: 'earnedMinutesTag', tag }
          : { kind: 'daysTag', tag };

  return {
    id: `custom:${crypto.randomUUID()}`,
    label,
    min,
    max: null,
    warnBelow: null,
    hidden: false,
    custom: { unit, source },
    order,
  };
}
