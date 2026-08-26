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

function windowBounds(anchor: Date, window: FixedWindow): { opens: Date; closes: Date } {
  return {
    opens: atTimeOn(anchor, window.opensAt),
    closes: atTimeOn(anchor, window.closesAt),
  };
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
  anchor: Date,
  start: Date,
  end: Date,
  windows: FixedWindow[],
  ownWindow: string | undefined,
): string | null {
  for (const window of windows) {
    if (window.id === ownWindow) continue;
    const { opens } = windowBounds(anchor, window);
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
      const { opens, closes } = windowBounds(anchor, window);

      if (cursor < opens) {
        // Idle forward to the window. The wait is unallocated time, shown as such.
        out.push(gapBlock(cursor, opens, def.id));
        cursor = opens;
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
      straddles: straddledWindow(anchor, start, end, windows, def.window),
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
