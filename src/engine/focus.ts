/**
 * Where focused time went — SPEC §4.4.
 *
 * One measure throughout, the same one the activity heatmap uses: the minutes a commitment
 * earned, its planned minutes times how much of it got done. A work block with time logged
 * against it and no commitment on it counts that logged time instead, so a block worked but
 * never committed to is not invisible — and never counted twice.
 *
 * From that one figure: a total per day, an average per weekday, a total per clock hour
 * (each block's minutes spread evenly over its scheduled span), and a split by area in
 * which every minute belongs to exactly one slice.
 *
 * Pure. The period, range, date and roadmap areas are passed in.
 */
import type { FocusArea } from '../config/schedule.config';
import type { CommitmentRecord, DayRecord } from '../db/schema';
import { completionOf } from './scoring';
import type { Period } from './pacing';

export interface FocusSlice {
  label: string;
  minutes: number;
  /** Whole percent of the period's total. */
  share: number;
}

export interface FocusSummary {
  totalMinutes: number;
  /** Every date in the range. Null after `asOf`: a day that has not happened yet. */
  byDay: { date: string; minutes: number | null }[];
  /** Monday first. Average over started days; null for a weekday with none. */
  byWeekday: { day: string; average: number | null; days: number }[];
  /** 24 clock hours, total minutes across the range. */
  byHour: number[];
  /** Minutes on commitments with no block, which have no hour to be placed in. */
  unplacedMinutes: number;
  /** Largest first, at most `maxSlices`, the rest folded into "Other". */
  areas: FocusSlice[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_MS = 3_600_000;

const earned = (commitment: CommitmentRecord): number =>
  commitment.status === 'displaced' ? 0 : commitment.plannedMinutes * completionOf(commitment);

/**
 * The area a commitment belongs to.
 *
 * Its own tags first, in area order. With no tags, the tags its block's preset carries — an
 * untagged "HTML + CSS" in the Spring Boot block is Spring Boot work. A tag no area names
 * still names itself rather than disappearing into "Untagged".
 */
export function areaFor(
  tags: string[],
  blockId: string | null,
  areas: FocusArea[],
  blockTags: Record<string, string[]>,
): string {
  const search = tags.length > 0 ? tags : (blockId ? blockTags[blockId] : undefined) ?? [];
  const area = areas.find((candidate) => search.some((tag) => candidate.tags.includes(tag)));
  if (area) return area.label;
  return tags[0] ?? 'Untagged';
}

/** Minutes of `[start, end)` falling in each clock hour, added into `hours`. */
function spreadOverHours(hours: number[], start: number, end: number, minutes: number): void {
  const span = end - start;
  if (span <= 0 || minutes <= 0) return;

  let cursor = start;
  while (cursor < end) {
    const at = new Date(cursor);
    const nextHour = new Date(at);
    nextHour.setMinutes(0, 0, 0);
    const boundary = Math.min(end, nextHour.getTime() + HOUR_MS);
    const hour = at.getHours();
    hours[hour] = (hours[hour] ?? 0) + (minutes * (boundary - cursor)) / span;
    cursor = boundary;
  }
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const at = new Date(`${from}T12:00:00`);
  const end = Date.parse(`${to}T12:00:00`);
  while (at.getTime() <= end) {
    out.push(
      `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`,
    );
    at.setDate(at.getDate() + 1);
  }
  return out;
}

export function focusSummary(
  period: Period,
  from: string,
  to: string,
  asOf: string,
  areas: FocusArea[],
  blockTags: Record<string, string[]>,
  maxSlices = 5,
): FocusSummary {
  const days = new Map<string, DayRecord>();
  for (const day of period.days) {
    if (day.date >= from && day.date <= to && day.date <= asOf) days.set(day.date, day);
  }

  const perDay = new Map<string, number>();
  const perArea = new Map<string, number>();
  const hours = Array<number>(24).fill(0);
  let unplaced = 0;

  const add = (date: string, area: string, minutes: number): void => {
    if (minutes <= 0) return;
    perDay.set(date, (perDay.get(date) ?? 0) + minutes);
    perArea.set(area, (perArea.get(area) ?? 0) + minutes);
  };

  // Commitments, placed in their block's hours when the block exists on that day.
  const committedBlocks = new Set<string>();
  for (const commitment of period.commitments) {
    const date = commitment.dayDate;
    if (date < from || date > to || date > asOf) continue;

    const minutes = earned(commitment);
    if (commitment.status !== 'displaced' && commitment.blockId) {
      committedBlocks.add(`${date}|${commitment.blockId}`);
    }
    if (minutes <= 0) continue;

    add(date, areaFor(commitment.tags, commitment.blockId, areas, blockTags), minutes);

    const block = days.get(date)?.blocks.find((entry) => entry.blockId === commitment.blockId);
    if (block) spreadOverHours(hours, block.startsAt, block.endsAt, minutes);
    else unplaced += minutes;
  }

  // Work blocks with logged time and nothing committed to them.
  for (const [date, day] of days) {
    for (const block of day.blocks) {
      if (block.kind !== 'work' || (block.workedMinutes ?? 0) <= 0) continue;
      if (committedBlocks.has(`${date}|${block.blockId}`)) continue;
      const minutes = block.workedMinutes ?? 0;
      add(date, areaFor([], block.blockId, areas, blockTags), minutes);
      spreadOverHours(hours, block.startsAt, block.endsAt, minutes);
    }
  }

  const dates = eachDate(from, to);
  const byDay = dates.map((date) => ({
    date,
    minutes: date > asOf ? null : Math.round(perDay.get(date) ?? 0),
  }));

  // Weekday averages over days that were actually started: an unopened day is absence,
  // not a zero, and averaging it in would make every weekday look worse than it was.
  const weekdayTotals = WEEKDAYS.map(() => ({ minutes: 0, days: 0 }));
  for (const [date, day] of days) {
    if (day.anchorAt === null) continue;
    const index = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const bucket = weekdayTotals[index];
    if (!bucket) continue;
    bucket.minutes += perDay.get(date) ?? 0;
    bucket.days += 1;
  }

  const totalMinutes = Math.round([...perDay.values()].reduce((sum, value) => sum + value, 0));

  const ranked = [...perArea.entries()]
    .map(([label, minutes]) => ({ label, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
  const kept = ranked.slice(0, maxSlices);
  const rest = ranked.slice(maxSlices).reduce((sum, entry) => sum + entry.minutes, 0);
  if (rest > 0) kept.push({ label: 'Other', minutes: rest });

  return {
    totalMinutes,
    byDay,
    byWeekday: WEEKDAYS.map((day, index) => {
      const bucket = weekdayTotals[index] ?? { minutes: 0, days: 0 };
      return {
        day,
        average: bucket.days === 0 ? null : Math.round(bucket.minutes / bucket.days),
        days: bucket.days,
      };
    }),
    byHour: hours.map((value) => Math.round(value)),
    unplacedMinutes: Math.round(unplaced),
    areas: kept.map((entry) => ({
      label: entry.label,
      minutes: Math.round(entry.minutes),
      share: totalMinutes === 0 ? 0 : Math.round((entry.minutes / totalMinutes) * 100),
    })),
  };
}

/** The index of the largest value, or null when everything is zero or missing. */
export function peakIndex(values: (number | null)[]): number | null {
  let best: number | null = null;
  values.forEach((value, index) => {
    if (value === null || value <= 0) return;
    if (best === null || value > (values[best] ?? 0)) best = index;
  });
  return best;
}
