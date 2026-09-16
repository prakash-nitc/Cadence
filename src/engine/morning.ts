/**
 * The morning card — SPEC §3.6.
 *
 * One quote and one affirmation a day. Picked from the day and from what the records say
 * about it, never at random, so the same card comes back on every visit until the next
 * day starts. The store writes the pick down the first time it is made, which keeps it
 * fixed even if something about the day changes after breakfast.
 *
 * Three rules, in order:
 *   1. Nothing repeats until the whole pool has been shown once.
 *   2. Among what has not been shown, prefer an entry that suits the kind of day.
 *   3. Favourites come back more often — about one day in three — but not two days running.
 *
 * Pure. The date, the history and the favourites are passed in.
 */
import type { MorningEntry, Theme } from '../content/morning';
import type { CommitmentRecord } from '../db/schema';
import type { ScheduledBlock } from './layout';
import { completionOf, isDropped } from './scoring';
import { sizeFor, type Size, type SizeThresholds } from './shape';

export interface ShownCard {
  date: string;
  quoteId: string | null;
  affirmationId: string | null;
}

export interface DayContext {
  date: string;
  /** Yesterday's band, if it was scored. */
  yesterdayBand: 'green' | 'yellow' | 'red' | null;
  /** Green days in a row, up to and including yesterday. */
  greenRun: number;
  /** Whether today has a Big commitment planned. */
  hasBig: boolean;
}

/** How far ahead to look for an entry that suits the day before taking the next one. */
const THEME_LOOKAHEAD = 6;

/** A favourite is not shown again within this many days. */
const FAVOURITE_GAP = 2;

/**
 * The kind of day it is, from the records.
 *
 * A red yesterday outranks the calendar: Monday after a bad Sunday wants getting back up
 * more than it wants a fresh start.
 */
export function themeFor(context: DayContext): Theme | null {
  const weekday = new Date(`${context.date}T12:00:00`).getDay();
  if (context.yesterdayBand === 'red') return 'comeback';
  if (weekday === 1) return 'start';
  if (weekday === 0) return 'review';
  if (context.greenRun >= 3) return 'consistency';
  if (context.hasBig) return 'focus';
  return null;
}

/** A small stable hash, so an order or a choice can be derived from a string. */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/**
 * The pool in a fixed order for a given year.
 *
 * Sorted by id first, so adding one entry does not reshuffle everything, then ordered by a
 * hash of year and id — a different running order each year, the same one all year.
 */
export function yearOrder(pool: MorningEntry[], year: number): MorningEntry[] {
  return [...pool]
    .sort((a, b) => a.id.localeCompare(b.id))
    .sort((a, b) => hash(`${year}:${a.id}`) - hash(`${year}:${b.id}`));
}

function dayOfYear(date: string): number {
  const at = Date.parse(`${date}T12:00:00`);
  const start = Date.parse(`${date.slice(0, 4)}-01-01T12:00:00`);
  return Math.round((at - start) / 86_400_000);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000,
  );
}

/**
 * One entry of a kind for a day.
 *
 * `history` is every card already shown; entries shown within the last pool-length days
 * are skipped, which is what makes the whole pool go round before anything repeats.
 */
export function pickEntry(
  entries: MorningEntry[],
  kind: MorningEntry['kind'],
  date: string,
  theme: Theme | null,
  history: ShownCard[],
  favourites: ReadonlySet<string>,
): MorningEntry | null {
  const pool = entries.filter((entry) => entry.kind === kind);
  if (pool.length === 0) return null;

  const shownOn = new Map<string, string>();
  for (const card of history) {
    if (card.date >= date) continue;
    const id = kind === 'quote' ? card.quoteId : card.affirmationId;
    if (!id) continue;
    const previous = shownOn.get(id);
    if (!previous || card.date > previous) shownOn.set(id, card.date);
  }
  const shownWithin = (id: string, days: number): boolean => {
    const last = shownOn.get(id);
    return last !== undefined && daysBetween(last, date) <= days;
  };

  // Favourites, about one day in three, never the same one two days running.
  const liked = yearOrder(
    pool.filter((entry) => favourites.has(entry.id)),
    Number(date.slice(0, 4)),
  );
  if (liked.length > 0 && hash(`${date}:${kind}:favourite`) % 3 === 0) {
    const fresh = liked.filter((entry) => !shownWithin(entry.id, FAVOURITE_GAP));
    const choice = fresh[hash(`${date}:${kind}`) % Math.max(1, fresh.length)];
    if (choice) return choice;
  }

  const order = yearOrder(pool, Number(date.slice(0, 4)));
  const start = dayOfYear(date) % order.length;
  const rotated = [...order.slice(start), ...order.slice(0, start)];

  // Not shown within one full cycle of the pool.
  const unseen = rotated.filter((entry) => !shownWithin(entry.id, pool.length - 1));
  const candidates = unseen.length > 0 ? unseen : rotated;

  if (theme) {
    const suited = candidates
      .slice(0, THEME_LOOKAHEAD)
      .find((entry) => entry.themes.includes(theme));
    if (suited) return suited;
  }
  return candidates[0] ?? null;
}

/** The whole card for a day. */
export function pickCard(
  entries: MorningEntry[],
  context: DayContext,
  history: ShownCard[],
  favourites: ReadonlySet<string>,
): ShownCard {
  const theme = themeFor(context);
  return {
    date: context.date,
    quoteId: pickEntry(entries, 'quote', context.date, theme, history, favourites)?.id ?? null,
    affirmationId:
      pickEntry(entries, 'affirmation', context.date, theme, history, favourites)?.id ?? null,
  };
}

/** How the card credits an entry, in words. Null when there is nothing to credit. */
export function creditLine(entry: MorningEntry): string | null {
  switch (entry.credit) {
    case 'spirit':
      return entry.source ? `in the spirit of ${entry.source}` : null;
    case 'rendering':
      return entry.source ? `${entry.by ?? ''} ${entry.source}`.trim() : entry.by;
    case 'attributed':
      return entry.by ? `attributed to ${entry.by}` : null;
    case 'said':
    default:
      if (!entry.by) return entry.source ?? null;
      return entry.source ? `${entry.by}, ${entry.source}` : entry.by;
  }
}

export interface FirstThing {
  label: string;
  size: Size;
  minutes: number;
}

/**
 * The one piece of work the card points at.
 *
 * A quote on its own fades by mid-morning. Naming the actual first thing turns it into a
 * direction: the day's first unfinished Big commitment, in the order the day runs, or the
 * first unfinished one of any size when nothing is Big. Dropped and finished work is
 * never named.
 */
export function firstThing(
  commitments: CommitmentRecord[],
  blocks: ScheduledBlock[],
  thresholds: SizeThresholds,
): FirstThing | null {
  const startOf = new Map(blocks.map((block) => [block.blockId, block.startsAt]));
  const open = commitments
    .filter((commitment) => !isDropped(commitment) && completionOf(commitment) < 1)
    .map((commitment, index) => ({ commitment, index }))
    // In the order the day runs; anything without a slot keeps its planned order, last.
    .sort((a, b) => {
      const at = startOf.get(a.commitment.blockId ?? '') ?? Number.MAX_SAFE_INTEGER;
      const bt = startOf.get(b.commitment.blockId ?? '') ?? Number.MAX_SAFE_INTEGER;
      return at - bt || a.index - b.index;
    })
    .map(({ commitment }) => commitment);

  const chosen =
    open.find((commitment) => sizeFor(commitment, thresholds) === 'big') ?? open[0];
  if (!chosen) return null;

  return {
    label: chosen.label,
    size: sizeFor(chosen, thresholds),
    minutes: chosen.plannedMinutes,
  };
}
