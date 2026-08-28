/**
 * The elastic day engine — SPEC §2.
 *
 * Blocks carry durations, never clock times. `layoutDay` is the only thing that turns
 * durations into wall-clock instants, and it does it from the day's anchor. Pure: no
 * I/O, no `Date.now()`. Compute once at Start day and persist — never on render.
 */
import type { BlockDef, BlockKind, FixedWindow, Priority } from '../config/schedule.config';
import { addMinutes, atTimeOn, minutesBetween } from '../lib/time';

export type BlockStatus = 'pending' | 'active' | 'contained' | 'overran' | 'skipped';

/** A gap is unallocated time, shown honestly. It is not a failure and not actionable. */
export type ScheduledKind = BlockKind | 'gap';

export interface ScheduledBlock {
  blockId: string;
  label: string;
  detail: string | null;
  kind: ScheduledKind;
  priority: Priority;
  /** Duration as laid, after any degradation. Minutes. */
  minutes: number;
  startsAt: number;
  endsAt: number;
  status: BlockStatus;
  actualEndedAt: number | null;
  /** Meal placed after its window closed. The app does not pretend the mess is open. */
  missedWindow: boolean;
  /** Window id this block runs across without being split — SPEC §2.2.4. */
  straddles: string | null;
  window: string | null;
}

const DAY_MS = 86_400_000;

/**
 * The longest a block will wait for a mess window to open.
 *
 * Waking at 04:30 against a 07:00 breakfast is a legitimate two-and-a-half hour wait.
 * A day anchored at 20:00 reaching a breakfast block at 21:30 is not waiting nine and a
 * half hours for the morning — that window is simply not part of this day, and idling to
 * it would bury the whole evening under one enormous gap.
 */
const MAX_IDLE_MINUTES = 4 * 60;

/**
 * Which occurrence of a mess window the cursor is dealing with.
 *
 * Resolving the window on the anchor's calendar date breaks any day that crosses
 * midnight: a shift starting at 22:00 reaches breakfast at 06:00 the next morning, and
 * against the anchor's date that window closed fifteen hours ago. Resolving it on the
 * cursor's date breaks the mirror case, where a block finishing at 00:30 would wait
 * nineteen hours for the following evening's dinner.
 *
 * So all three nearby occurrences are considered and the closest one wins — the window
 * the cursor is inside, or failing that the one it is nearest to. No thresholds, and it
 * degrades to the obvious answer on an ordinary day.
 */
function windowBounds(cursor: Date, window: FixedWindow): { opens: Date; closes: Date } {
  const candidates = [-1, 0, 1].map((offset) => {
    const base = new Date(cursor.getTime() + offset * DAY_MS);
    return { opens: atTimeOn(base, window.opensAt), closes: atTimeOn(base, window.closesAt) };
  });

  const distance = ({ opens, closes }: { opens: Date; closes: Date }): number => {
    if (cursor >= opens && cursor <= closes) return 0;
    return Math.min(
      Math.abs(cursor.getTime() - opens.getTime()),
      Math.abs(cursor.getTime() - closes.getTime()),
    );
  };

  return candidates.reduce((best, candidate) =>
    distance(candidate) < distance(best) ? candidate : best,
  );
}

function gapBlock(from: Date, to: Date, beforeBlockId: string): ScheduledBlock {
  return {
    blockId: `gap:${beforeBlockId}`,
    label: 'Free',
    detail: null,
    kind: 'gap',
    priority: 2,
    minutes: minutesBetween(from, to),
    startsAt: from.getTime(),
    endsAt: to.getTime(),
    status: 'pending',
    actualEndedAt: null,
    missedWindow: false,
    straddles: null,
    window: null,
  };
}

/**
 * Which fixed window, if any, this block runs across the opening of.
 *
 * A work block is never split (SPEC §2.2.4) — splitting a deep work block is worse than
 * eating late — so a straddle is recorded and the meal that follows absorbs the delay
 * through the placement rules in `layoutDay`.
 */
function straddledWindow(
  start: Date,
  end: Date,
  windows: FixedWindow[],
  ownWindow: string | undefined,
): string | null {
  for (const window of windows) {
    if (window.id === ownWindow) continue;
    const { opens } = windowBounds(start, window);
    if (start < opens && end > opens) return window.id;
  }
  return null;
}

/**
 * anchor + template + fixed windows -> the day, laid end to end.
 *
 * Boundaries are immutable once laid (SPEC §2.3). Finishing early does not shift the
 * next block up; skipping leaves a hole. Those are day-mechanics concerns, not layout's.
 */
export function layoutDay(
  anchor: Date,
  template: BlockDef[],
  windows: FixedWindow[],
): ScheduledBlock[] {
  const out: ScheduledBlock[] = [];
  let cursor = anchor;

  for (const def of template) {
    const window = def.window ? windows.find((w) => w.id === def.window) : undefined;
    let missedWindow = false;

    if (def.kind === 'meal' && window) {
      const { opens, closes } = windowBounds(cursor, window);

      if (cursor < opens) {
        if (minutesBetween(cursor, opens) <= MAX_IDLE_MINUTES) {
          // Idle forward to the window. The wait is unallocated time, shown as such.
          out.push(gapBlock(cursor, opens, def.id));
          cursor = opens;
        } else {
          // Too far ahead to be this day's meal. Place it here and say so.
          missedWindow = true;
        }
      } else if (cursor > closes) {
        // Past close. Place it where we actually are and say the window was missed.
        missedWindow = true;
      }
      // Inside the window: place at cursor, nothing to adjust.
    }

    const start = cursor;
    const end = addMinutes(cursor, def.minutes);

    out.push({
      blockId: def.id,
      label: def.label,
      detail: def.detail ?? null,
      kind: def.kind,
      priority: def.priority,
      minutes: def.minutes,
      startsAt: start.getTime(),
      endsAt: end.getTime(),
      status: 'pending',
      actualEndedAt: null,
      missedWindow,
      straddles: straddledWindow(start, end, windows, def.window),
      window: def.window ?? null,
    });

    cursor = end;
  }

  return out;
}

/** Total wall-clock span of a laid day, gaps included. */
export function laidSpanMinutes(blocks: ScheduledBlock[]): number {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last) return 0;
  return minutesBetween(first.startsAt, last.endsAt);
}
