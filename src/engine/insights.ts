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
 * 2. **Never claim more than the gap supports.** A sentence is chosen to fit its numbers:
 *    a part of the day at 80% is not "failing" because something beat it, and one at 61%
 *    against 58% is not a finding at all — it says so, and the bars underneath let the
 *    reader watch it rather than take it on trust.
 *
 * Pure. The clock and the day are passed in.
 */
import type { DayRecord, InterruptionReason, LogRecord } from '../db/schema';
import { isActionable, isResolved } from './boundaries';
import type { Period } from './pacing';
import { partOfDay, type PartOfDay } from './pacing';
import { scoreDay } from './scoring';
import type { Prefs } from '../lib/prefs';

/** One group in the comparison a claim rests on — a part of the day, a sleep band. */
export interface InsightBar {
  label: string;
  /** The measured value. Percentages are 0–100; counts are counts. */
  value: number;
  /** What it rests on, in words: "12 blocks", "6 days". */
  sub: string;
  /** One of the groups the sentence above is actually about. Carries the accent. */
  named?: boolean;
  /** Below its own threshold: drawn, but drawn quietly and not claimed from. */
  thin?: boolean;
}

export interface Insight {
  /** Stable id, so the list can be rendered without index keys. */
  key: string;
  /** The claim, in one sentence. */
  headline: string;
  /** The numbers behind it. */
  detail: string;
  /** How many days it rests on, shown so the reader can discount it. */
  sample: number;
  /**
   * The comparison itself, so the claim can be watched rather than taken on trust.
   *
   * Every group is drawn, including ones too thin to claim from — seeing a bar fill up
   * over a fortnight is the point, and hiding it until it qualifies hides the progress.
   */
  bars: InsightBar[];
  /** Suffix on each bar's number. */
  unit: string;
  /** Scale the bars against. Percentages cap at 100; counts scale to the largest. */
  max: number | null;
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

/** The same five reasons as labels rather than sentence fragments. */
const REASON_LABELS: Record<InterruptionReason, string> = {
  messages: 'Messages',
  someone: 'Someone came in',
  searching: 'Looking for something',
  flat: 'Running flat',
  other: 'Something else',
};

const REASON_WORDS: Record<InterruptionReason, string> = {
  messages: 'messages',
  someone: 'someone coming in',
  searching: 'going to look for something',
  flat: 'running flat',
  other: 'something else',
};

/** The order a day happens in, so the bars do not reshuffle themselves week to week. */
const ORDER: PartOfDay[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

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

  /*
   * Every part of the day that has any blocks at all, in the order a day happens — not
   * ordered by score. This is the thing being tracked, so it has to sit still between
   * visits, and a part still gathering blocks is drawn thin rather than hidden.
   */
  const gap = best.percent - worst.percent;
  const named = gap < MIN_CONTAINMENT_GAP ? new Set<PartOfDay>() : new Set([best.part, worst.part]);

  const bars: InsightBar[] = ORDER.filter((part) => tally.has(part)).map((part) => {
    const seen = tally.get(part) ?? { contained: 0, total: 0 };
    const thin = seen.total < MIN_BLOCKS_PER_PART;
    return {
      label: part,
      value: Math.round((seen.contained / seen.total) * 100),
      sub: `${seen.contained} of ${seen.total} blocks`,
      ...(named.has(part) ? { named: true } : {}),
      ...(thin ? { thin: true } : {}),
    };
  });

  const strong = best.part.toLowerCase();
  const weak = worst.part.toLowerCase();

  /*
   * The sentence fits the numbers, in three steps down.
   *
   * A 20-point gap between 100% and 80% is worth knowing, but "your night blocks do not
   * hold" is false of 80%, so the blunt version waits for a part of the day that is
   * actually failing. And under the gap threshold the honest claim is that nothing
   * separates — which is a finding too, and better said than left as silence now that
   * the bars underneath make it something to watch rather than a bare assertion.
   */
  const headline =
    gap < MIN_CONTAINMENT_GAP
      ? 'No part of the day stands out yet.'
      : worst.percent < NOT_HOLDING
        ? `Your ${strong} blocks hold; your ${weak} ones do not.`
        : `Your ${strong} blocks hold better than your ${weak} ones.`;

  return {
    key: 'partOfDay',
    headline,
    detail:
      gap < MIN_CONTAINMENT_GAP
        ? `The widest gap is ${gap} points, between the ${strong} and the ${weak}.`
        : `${best.percent}% contained in the ${strong}, ${worst.percent}% in the ${weak}.`,
    sample: best.total + worst.total,
    bars,
    unit: '%',
    max: 100,
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
    bars: [
      { label: `Under ${hours}h`, value: shortScore, sub: `${short.length} nights`, named: true },
      { label: `${hours}h or more`, value: longScore, sub: `${long.length} nights`, named: true },
    ],
    unit: '%',
    max: 100,
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
    bars: [
      { label: 'Energy 1–2', value: lowScore, sub: `${low.length} days`, named: true },
      { label: 'Energy 4–5', value: highScore, sub: `${high.length} days`, named: true },
    ],
    unit: '%',
    max: 100,
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
    bars: count(all.map((entry) => entry.reason)).map(([reason, times]) => ({
      label: REASON_LABELS[reason],
      value: times,
      sub: `${Math.round((times / all.length) * 100)}% of them`,
      ...(reason === topReason[0] ? { named: true } : {}),
    })),
    unit: '',
    max: null,
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
