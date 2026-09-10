/**
 * What your own records already say — SPEC §4.5.
 *
 * Cadence stores sleep, energy, containment, a score and now interruptions for every day,
 * and until this file none of it was read together. Everything here is a correlation over
 * stored rows: nothing is modelled, predicted, or inferred beyond arithmetic.
 *
 * Two rules govern the whole file:
 *
 * 1. **Never speak without enough behind it.** Each insight declares its own minimum and
 *    returns nothing below it. A claim from four days is noise wearing a number.
 * 2. **Never speak without a gap worth acting on.** "You contain 61% in the morning and
 *    58% in the afternoon" is true and useless; it is left unsaid.
 *
 * Pure. The clock and the day are passed in.
 */
import type { DayRecord, InterruptionReason, LogRecord } from '../db/schema';
import { isActionable, isResolved } from './boundaries';
import type { Period } from './pacing';
import { partOfDay, type PartOfDay } from './pacing';
import { scoreDay } from './scoring';
import type { Prefs } from '../lib/prefs';

export interface Insight {
  /** Stable id, so the list can be rendered without index keys. */
  key: string;
  /** The claim, in one sentence. */
  headline: string;
  /** The numbers behind it. */
  detail: string;
  /** How many days it rests on, shown so the reader can discount it. */
  sample: number;
}

/** Minimums, in days or blocks. Below these an insight says nothing at all. */
const MIN_BLOCKS_PER_PART = 6;
const MIN_DAYS_PER_SIDE = 4;
const MIN_INTERRUPTIONS = 5;

/** Gaps smaller than these are real but not worth a sentence. */
const MIN_CONTAINMENT_GAP = 15;
const MIN_SCORE_GAP = 10;

/**
 * Below this, a part of the day is genuinely not holding and the sentence may say so.
 * Above it, the claim is only that one part is better than another — 80% contained is
 * holding, whatever it sits next to, and calling it a failure would be untrue.
 */
const NOT_HOLDING = 60;

const REASON_WORDS: Record<InterruptionReason, string> = {
  messages: 'messages',
  someone: 'someone coming in',
  searching: 'going to look for something',
  flat: 'running flat',
  other: 'something else',
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const low = sorted[middle - 1];
  const high = sorted[middle];
  if (high === undefined) return 0;
  return sorted.length % 2 === 0 && low !== undefined ? (low + high) / 2 : high;
};

/**
 * Containment by part of the day.
 *
 * Reads blocks that were actually answered for, so a day nobody closed out contributes
 * nothing rather than counting as failure.
 */
function byPartOfDay(days: DayRecord[]): Insight | null {
  const tally = new Map<PartOfDay, { contained: number; total: number }>();

  for (const day of days) {
    for (const block of day.blocks) {
      if (!isActionable(block) || !isResolved(block)) continue;
      const part = partOfDay(block.startsAt);
      const seen = tally.get(part) ?? { contained: 0, total: 0 };
      seen.total += 1;
      if (block.status === 'contained') seen.contained += 1;
      tally.set(part, seen);
    }
  }

  const rated = [...tally.entries()]
    .filter(([, seen]) => seen.total >= MIN_BLOCKS_PER_PART)
    .map(([part, seen]) => ({
      part,
      percent: Math.round((seen.contained / seen.total) * 100),
      total: seen.total,
    }))
    .sort((a, b) => b.percent - a.percent);

  const best = rated[0];
  const worst = rated[rated.length - 1];
  if (!best || !worst || best.part === worst.part) return null;
  if (best.percent - worst.percent < MIN_CONTAINMENT_GAP) return null;

  /*
   * The verdict has to fit the number. A 20-point gap between 100% and 80% is worth
   * knowing, but "your night blocks do not hold" is false of 80% — the strong sentence
   * is reserved for a part of the day that is actually failing.
   */
  const failing = worst.percent < NOT_HOLDING;

  return {
    key: 'partOfDay',
    headline: failing
      ? `Your ${best.part.toLowerCase()} blocks hold; your ${worst.part.toLowerCase()} ones do not.`
      : `Your ${best.part.toLowerCase()} blocks hold better than your ${worst.part.toLowerCase()} ones.`,
    detail: `${best.percent}% contained in the ${best.part.toLowerCase()}, ${worst.percent}% in the ${worst.part.toLowerCase()}.`,
    sample: best.total + worst.total,
  };
}

/**
 * Sleep against score.
 *
 * Split at the median night rather than a fixed seven hours, so the comparison is against
 * your own normal instead of a number off a poster.
 */
function sleepAgainstScore(logs: LogRecord[], scores: Map<string, number>): Insight | null {
  const paired: { sleep: number; score: number }[] = [];
  for (const log of logs) {
    const score = scores.get(log.date);
    if (score !== undefined) paired.push({ sleep: log.sleepHours, score });
  }

  if (paired.length < MIN_DAYS_PER_SIDE * 2) return null;

  const split = median(paired.map((row) => row.sleep));
  const long = paired.filter((row) => row.sleep >= split);
  const short = paired.filter((row) => row.sleep < split);
  if (long.length < MIN_DAYS_PER_SIDE || short.length < MIN_DAYS_PER_SIDE) return null;

  const longScore = Math.round(median(long.map((row) => row.score)));
  const shortScore = Math.round(median(short.map((row) => row.score)));
  if (longScore - shortScore < MIN_SCORE_GAP) return null;

  const hours = Math.round(split * 10) / 10;
  return {
    key: 'sleep',
    headline: `Short nights cost you ${longScore - shortScore} points.`,
    detail: `Under ${hours} hours your median day is ${shortScore}%. At or over it, ${longScore}%.`,
    sample: paired.length,
  };
}

/** Energy against score, on the same shape of comparison. */
function energyAgainstScore(logs: LogRecord[], scores: Map<string, number>): Insight | null {
  const paired: { energy: number; score: number }[] = [];
  for (const log of logs) {
    const score = scores.get(log.date);
    if (score !== undefined) paired.push({ energy: log.energy, score });
  }

  if (paired.length < MIN_DAYS_PER_SIDE * 2) return null;

  const high = paired.filter((row) => row.energy >= 4);
  const low = paired.filter((row) => row.energy <= 2);
  if (high.length < MIN_DAYS_PER_SIDE || low.length < MIN_DAYS_PER_SIDE) return null;

  const highScore = Math.round(median(high.map((row) => row.score)));
  const lowScore = Math.round(median(low.map((row) => row.score)));
  if (highScore - lowScore < MIN_SCORE_GAP) return null;

  return {
    key: 'energy',
    headline: 'The days you start sharp are the days that land.',
    detail: `Energy 4 or 5: median ${highScore}%. Energy 1 or 2: median ${lowScore}%.`,
    sample: paired.length,
  };
}

/** What actually pulls you out, and out of what. */
function whatInterrupts(days: DayRecord[]): Insight | null {
  const all = days.flatMap((day) => day.interruptions ?? []);
  if (all.length < MIN_INTERRUPTIONS) return null;

  const count = <T>(values: T[]): [T, number][] => {
    const seen = new Map<T, number>();
    for (const value of values) seen.set(value, (seen.get(value) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  };

  const topReason = count(all.map((entry) => entry.reason))[0];
  if (!topReason) return null;

  const parts = count(all.map((entry) => partOfDay(entry.at)));
  const topPart = parts[0];

  const share = Math.round((topReason[1] / all.length) * 100);
  const where =
    topPart && topPart[1] > all.length / 2
      ? ` Most of it in the ${topPart[0].toLowerCase()}.`
      : '';

  return {
    key: 'interruptions',
    headline: `${REASON_WORDS[topReason[0]]} takes most of what you lose.`.replace(
      /^./,
      (first) => first.toUpperCase(),
    ),
    detail: `${topReason[1]} of ${all.length} interruptions, ${share}%.${where}`,
    sample: all.length,
  };
}

/**
 * Everything the records will support, best-founded first.
 *
 * Returns an empty list rather than filler when nothing clears its threshold — the
 * absence of a claim is itself honest, and the screen says so.
 */
export function insights(period: Period, prefs: Prefs, asOf: string): Insight[] {
  const days = period.days.filter((day) => day.date <= asOf && day.anchorAt !== null);
  const logs = period.logs.filter((log) => log.date <= asOf);

  const byDay = new Map<string, typeof period.commitments>();
  for (const commitment of period.commitments) {
    const list = byDay.get(commitment.dayDate);
    if (list) list.push(commitment);
    else byDay.set(commitment.dayDate, [commitment]);
  }

  /** Recomputed from current Settings, like every other score in the app. */
  const scores = new Map<string, number>();
  for (const day of days) {
    const result = scoreDay(byDay.get(day.date) ?? [], prefs, day.plannedAt !== null);
    if (result.score !== null) scores.set(day.date, result.score);
  }

  return [
    byPartOfDay(days),
    sleepAgainstScore(logs, scores),
    energyAgainstScore(logs, scores),
    whatInterrupts(days),
  ]
    .filter((insight): insight is Insight => insight !== null)
    .sort((a, b) => b.sample - a.sample);
}

/** How many more days of records the quietest insight is waiting on. */
export function daysUntilInsights(period: Period, asOf: string): number {
  const logged = period.logs.filter((log) => log.date <= asOf).length;
  return Math.max(0, MIN_DAYS_PER_SIDE * 2 - logged);
}
