/**
 * Weekly and monthly pacing — SPEC §4.3, §4.4, §4.5.
 *
 * Read-only and fed entirely by daily commitments — nothing is logged twice. Pure: the
 * clock arrives as `asOf`.
 */
import type { Milestone, TargetSource, WeeklyTarget } from '../config/schedule.config';
import type { Band, CommitmentRecord, DayRecord, LogRecord } from '../db/schema';
import type { Prefs } from '../lib/prefs';
import { completionOf, scoreDay } from './scoring';

/** Everything the pacing functions read about a stretch of days. */
export interface Period {
  days: DayRecord[];
  commitments: CommitmentRecord[];
  logs: LogRecord[];
}

// ─── Day bands ────────────────────────────────────────────────────────────────

export interface DayBand {
  date: string;
  band: Band | null;
  score: number | null;
  template: string;
  placementMode: boolean;
  planned: boolean;
  anchored: boolean;
}

/**
 * Band every day in the period.
 *
 * Recomputed from commitments and current Settings rather than read from the stored
 * `score`/`band` snapshot. Thresholds and the non-negotiable gate are Settings, so
 * changing one has to re-band history — otherwise the Settings screen would be lying
 * about what it controls.
 *
 * A day with no record at all is not in the result: it is a day that never happened, not
 * a red one. Only days the user actually opened the app on get judged.
 */
export function bandDays(period: Period, prefs: Prefs): DayBand[] {
  const byDay = new Map<string, CommitmentRecord[]>();
  for (const commitment of period.commitments) {
    const list = byDay.get(commitment.dayDate);
    if (list) list.push(commitment);
    else byDay.set(commitment.dayDate, [commitment]);
  }

  return period.days
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const result = scoreDay(byDay.get(day.date) ?? [], prefs, day.plannedAt !== null);
      return {
        date: day.date,
        band: result.band,
        score: result.score,
        template: day.template,
        placementMode: day.placementMode,
        planned: day.plannedAt !== null,
        anchored: day.anchorAt !== null,
      };
    });
}

// ─── Week shape ───────────────────────────────────────────────────────────────

export interface Shape {
  green: number;
  yellow: number;
  red: number;
  /** Days that had nothing left to score — every commitment displaced. */
  unscored: number;
  targetMet: boolean;
  /** Named, not just rendered — SPEC §4.3. */
  warning: string | null;
}

/**
 * The metric that matters more than any single day.
 *
 * Three yellows is called out by name: it is the pattern that precedes collapse, and a
 * week can hit its green target while still being on that path.
 */
export function weekShape(bands: DayBand[], prefs: Prefs): Shape {
  const count = (band: Band): number => bands.filter((day) => day.band === band).length;

  const green = count('green');
  const yellow = count('yellow');
  const red = count('red');
  const unscored = bands.filter((day) => day.band === null).length;

  const targets = prefs.weekShape;
  const targetMet = green >= targets.minGreen && yellow <= targets.maxYellow && red <= targets.maxRed;

  let warning: string | null = null;
  if (yellow >= 3) {
    warning = 'Three yellows. That is the pattern that precedes collapse.';
  } else if (red > targets.maxRed) {
    warning = `${red} red days against a limit of ${targets.maxRed}.`;
  }

  return { green, yellow, red, unscored, targetMet, warning };
}

// ─── Weekly targets ───────────────────────────────────────────────────────────

export interface Displacement {
  count: number;
  /** Distinct reasons, in first-seen order. Debt does not clear — SPEC §4.3. */
  reasons: string[];
}

export interface TargetPace {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number | null;
  achieved: number;
  /** Null when the roadmap declares the target but the app cannot measure it. */
  tracked: boolean;
  remainingDays: number;
  /** Units still needed to reach `min`. */
  shortfall: number;
  /** Per-day rate needed to reach `min`. Null once met, or when untracked. */
  requiredRate: number | null;
  /**
   * Whether a per-day rate means anything for this target. It does for hours and
   * problems; it does not for a target whose unit is already a count of days —
   * "need 0.3 days per day" is not a sentence worth printing.
   */
  ratePerDay: boolean;
  reachable: boolean;
  /** Units short when the week can no longer physically reach the target. */
  shortBy: number;
  /** Below `warnBelow` — red regardless of how legitimate each displacement was. */
  belowWarn: boolean;
  displaced: Displacement;
}

export function measure(source: TargetSource, period: Period): number {
  /**
   * Displaced work never happened — SPEC §4.1 — so it never counts toward a target.
   * Its cost shows up separately as debt, which is where §4.3 puts it.
   *
   * Skipped and avoided work is not filtered here: whatever was logged against it was
   * still real time at the desk. Scoring judges whether the commitment was honoured;
   * pacing counts hours put in. Those are different questions and may differ.
   */
  const happened = period.commitments.filter(
    (commitment) => commitment.status !== 'displaced',
  );

  switch (source.kind) {
    case 'countTag':
      return happened
        .filter(
          (commitment) =>
            commitment.targetType === 'count' && commitment.tags.includes(source.tag),
        )
        .reduce((sum, commitment) => sum + commitment.done, 0);

    case 'minutesTag':
      return (
        happened
          .filter(
            (commitment) =>
              commitment.targetType === 'minutes' && commitment.tags.includes(source.tag),
          )
          .reduce((sum, commitment) => sum + commitment.done, 0) / 60
      );

    case 'daysTag':
      return new Set(
        happened
          .filter(
            (commitment) =>
              commitment.tags.includes(source.tag) && completionOf(commitment) >= 1,
          )
          .map((commitment) => commitment.dayDate),
      ).size;

    case 'containedBlock':
      return period.days.filter((day) =>
        day.blocks.some(
          (block) => block.blockId === source.blockId && block.status === 'contained',
        ),
      ).length;

    case 'sleepNights':
      return period.logs.filter((log) => log.sleepHours >= source.minHours).length;
  }
}

function displacementFor(source: TargetSource | undefined, period: Period): Displacement {
  if (!source || !('tag' in source)) return { count: 0, reasons: [] };

  const dropped = period.commitments.filter(
    (commitment) =>
      commitment.status === 'displaced' && commitment.tags.includes(source.tag),
  );

  const reasons: string[] = [];
  for (const commitment of dropped) {
    if (commitment.displacedBy && !reasons.includes(commitment.displacedBy)) {
      reasons.push(commitment.displacedBy);
    }
  }

  return { count: dropped.length, reasons };
}

/**
 * Required daily rate — the thing that creates urgency on a Wednesday.
 *
 * `dailyCapacityHours` is what one day can physically hold. It only bounds hour-based
 * targets: the app has no basis for calling twenty problems a day impossible, so it does
 * not pretend to.
 */
export function weeklyPacing(
  period: Period,
  targets: WeeklyTarget[],
  remainingDays: number,
  dailyCapacityHours: number,
): TargetPace[] {
  return targets.map((target) => {
    const tracked = target.source !== undefined;
    const achieved = target.source ? measure(target.source, period) : 0;
    const shortfall = Math.max(0, target.min - achieved);

    const requiredRate =
      !tracked || shortfall === 0 || remainingDays <= 0 ? null : shortfall / remainingDays;

    const ratePerDay =
      target.source !== undefined &&
      target.source.kind !== 'daysTag' &&
      target.source.kind !== 'sleepNights' &&
      target.source.kind !== 'containedBlock';

    const capped = target.unit === 'hours' && requiredRate !== null;
    const reachable = !capped || (requiredRate ?? 0) <= dailyCapacityHours;

    return {
      id: target.id,
      label: target.label,
      unit: target.unit,
      min: target.min,
      max: target.max ?? null,
      achieved: Math.round(achieved * 10) / 10,
      tracked,
      remainingDays,
      shortfall: Math.round(shortfall * 10) / 10,
      requiredRate: requiredRate === null ? null : Math.round(requiredRate * 10) / 10,
      ratePerDay,
      reachable,
      shortBy: reachable ? 0 : Math.round((shortfall - dailyCapacityHours * remainingDays) * 10) / 10,
      belowWarn: tracked && target.warnBelow !== undefined && achieved < target.warnBelow,
      displaced: displacementFor(target.source, period),
    };
  });
}

// ─── Week and month tallies ───────────────────────────────────────────────────

export interface Tallies {
  containedPercent: number | null;
  pushes: number;
  avoided: number;
  displaced: number;
  /** Mean energy across logged days, or null with nothing logged. */
  energy: number | null;
  energyTrend: number[];
}

export function tallies(period: Period): Tallies {
  const blocks = period.days.flatMap((day) => day.blocks).filter((block) => block.kind !== 'gap');
  const resolved = blocks.filter(
    (block) =>
      block.status === 'contained' || block.status === 'overran' || block.status === 'skipped',
  );
  const contained = resolved.filter((block) => block.status === 'contained').length;

  const energies = period.logs
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((log) => log.energy);

  return {
    containedPercent:
      resolved.length === 0 ? null : Math.round((contained / resolved.length) * 100),
    pushes: period.days.reduce((sum, day) => sum + day.pushes.length, 0),
    avoided: period.commitments.filter((commitment) => commitment.status === 'avoided').length,
    displaced: period.commitments.filter((commitment) => commitment.status === 'displaced').length,
    energy:
      energies.length === 0
        ? null
        : Math.round((energies.reduce((sum, value) => sum + value, 0) / energies.length) * 10) /
          10,
    energyTrend: energies,
  };
}

/** Tag-level totals for the month view — SPEC §4.4. */
export function tagTotals(period: Period): { tag: string; minutes: number; done: number }[] {
  const totals = new Map<string, { minutes: number; done: number }>();

  for (const commitment of period.commitments) {
    if (commitment.status === 'displaced') continue;
    const earned = commitment.plannedMinutes * completionOf(commitment);
    for (const tag of commitment.tags) {
      const current = totals.get(tag) ?? { minutes: 0, done: 0 };
      current.minutes += earned;
      current.done += commitment.done;
      totals.set(tag, current);
    }
  }

  return [...totals.entries()]
    .map(([tag, value]) => ({ tag, minutes: Math.round(value.minutes), done: value.done }))
    .sort((a, b) => b.minutes - a.minutes);
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export type MilestoneStatus = 'upcoming' | 'atRisk' | 'done' | 'missed';

export interface MilestoneView {
  key: string;
  date: string;
  label: string;
  critical: boolean;
  checklist: string[];
  checked: string[];
  daysRemaining: number;
  status: MilestoneStatus;
}

export const milestoneKey = (milestone: Milestone): string =>
  `${milestone.date}|${milestone.label}`;

/**
 * Milestone status — SPEC §4.4.
 *
 * At risk is "within seven days and the linked work not started". Started means either a
 * checklist item ticked or, for a milestone with no checklist, nothing to go on but the
 * date — so a week out and not yet done reads as at risk.
 */
export function milestoneStatuses(
  milestones: Milestone[],
  progress: Map<string, { checked: string[]; doneAt: number | null }>,
  asOf: string,
): MilestoneView[] {
  const AT_RISK_DAYS = 7;

  return milestones.map((milestone) => {
    const key = milestoneKey(milestone);
    const state = progress.get(key);
    const checklist = milestone.checklist ?? [];
    const checked = state?.checked ?? [];

    const done =
      state?.doneAt != null ||
      (checklist.length > 0 && checklist.every((item) => checked.includes(item)));

    const daysRemaining = Math.round(
      (Date.parse(`${milestone.date}T00:00:00`) - Date.parse(`${asOf}T00:00:00`)) / 86_400_000,
    );

    const status: MilestoneStatus = done
      ? 'done'
      : daysRemaining < 0
        ? 'missed'
        : daysRemaining <= AT_RISK_DAYS && checked.length === 0
          ? 'atRisk'
          : 'upcoming';

    return {
      key,
      date: milestone.date,
      label: milestone.label,
      critical: milestone.critical ?? false,
      checklist,
      checked,
      daysRemaining,
      status,
    };
  });
}

// ─── Monthly targets ──────────────────────────────────────────────────────────

/** A stretch of the month, clipped to it, that one week contributed to. */
export interface WeekSlice {
  from: string;
  to: string;
}

/**
 * The Monday-start weeks overlapping a range, each clipped to it.
 *
 * A month rarely starts on a Monday, so its first and last weeks are partial. Clipping
 * keeps the per-week breakdown honest: a three-day tail is shown as the three days it
 * was, not as a week that mysteriously produced less.
 */
export function weeksInRange(from: string, to: string): WeekSlice[] {
  const dayMs = 86_400_000;
  const startOfWeek = (date: string): number => {
    const at = new Date(`${date}T12:00:00`);
    return at.getTime() - ((at.getDay() + 6) % 7) * dayMs;
  };
  const key = (at: number): string => new Date(at).toISOString().slice(0, 10);

  const out: WeekSlice[] = [];
  const end = Date.parse(`${to}T12:00:00`);

  for (let weekStart = startOfWeek(from); weekStart <= end; weekStart += 7 * dayMs) {
    const weekEnd = weekStart + 6 * dayMs;
    out.push({
      from: key(Math.max(weekStart, Date.parse(`${from}T12:00:00`))),
      to: key(Math.min(weekEnd, end)),
    });
  }

  return out;
}

/** What a month's target is, before the user has said otherwise. */
export function seedMonthlyTarget(weeklyMin: number, daysInMonth: number): number {
  return Math.round((weeklyMin * daysInMonth) / 7);
}

export interface MonthPace {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number | null;
  achieved: number;
  tracked: boolean;
  weeksRemaining: number;
  shortfall: number;
  /** Per-week rate needed to reach `min`. Null once met, or when untracked. */
  requiredPerWeek: number | null;
  /** Whether a per-week rate means anything, or the unit is already a count of days. */
  ratePerWeek: boolean;
  reachable: boolean;
  shortBy: number;
  belowWarn: boolean;
  displaced: Displacement;
  /** What each week of the month actually contributed. */
  weeks: { from: string; to: string; achieved: number }[];
}

/**
 * Pace a month against its own targets — SPEC §4.4.
 *
 * The month's numbers are a plan for that month, not a roadmap constant, so they arrive
 * as overrides. Anything the user has not set falls back to the weekly target scaled to
 * the month's length.
 *
 * The per-week breakdown is what makes a lost month diagnosable: knowing you are 20 hours
 * short says nothing about which week lost them.
 */
export function monthlyPacing(
  period: Period,
  targets: WeeklyTarget[],
  overrides: Record<string, { min: number; max: number | null }>,
  weeks: WeekSlice[],
  weeksRemaining: number,
  daysInMonth: number,
  weeklyCapacityHours: number,
): MonthPace[] {
  const slice = (from: string, to: string): Period => ({
    days: period.days.filter((day) => day.date >= from && day.date <= to),
    commitments: period.commitments.filter(
      (commitment) => commitment.dayDate >= from && commitment.dayDate <= to,
    ),
    logs: period.logs.filter((log) => log.date >= from && log.date <= to),
  });

  return targets.map((target) => {
    const tracked = target.source !== undefined;
    const override = overrides[target.id];
    const min = override ? override.min : seedMonthlyTarget(target.min, daysInMonth);
    const max = override
      ? override.max
      : target.max === undefined
        ? null
        : seedMonthlyTarget(target.max, daysInMonth);

    const achieved = target.source ? measure(target.source, period) : 0;
    const shortfall = Math.max(0, min - achieved);

    const requiredPerWeek =
      !tracked || shortfall === 0 || weeksRemaining <= 0 ? null : shortfall / weeksRemaining;

    const ratePerWeek =
      target.source !== undefined &&
      target.source.kind !== 'daysTag' &&
      target.source.kind !== 'sleepNights' &&
      target.source.kind !== 'containedBlock';

    const capped = target.unit === 'hours' && requiredPerWeek !== null;
    const reachable = !capped || (requiredPerWeek ?? 0) <= weeklyCapacityHours;

    return {
      id: target.id,
      label: target.label,
      unit: target.unit,
      min,
      max,
      achieved: Math.round(achieved * 10) / 10,
      tracked,
      weeksRemaining,
      shortfall: Math.round(shortfall * 10) / 10,
      requiredPerWeek:
        requiredPerWeek === null ? null : Math.round(requiredPerWeek * 10) / 10,
      ratePerWeek,
      reachable,
      shortBy: reachable
        ? 0
        : Math.round((shortfall - weeklyCapacityHours * weeksRemaining) * 10) / 10,
      belowWarn:
        tracked &&
        target.warnBelow !== undefined &&
        achieved < seedMonthlyTarget(target.warnBelow, daysInMonth),
      displaced: displacementFor(target.source, period),
      weeks: weeks.map((week) => ({
        ...week,
        achieved: target.source
          ? Math.round(measure(target.source, slice(week.from, week.to)) * 10) / 10
          : 0,
      })),
    };
  });
}
