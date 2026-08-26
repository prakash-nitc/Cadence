import { describe, expect, it } from 'vitest';
import { FIXED_WINDOWS, FULL_DAY, LATE_NIGHT } from '../config/schedule.config';
import { toHHMM } from '../lib/time';
import { layoutDay, type ScheduledBlock } from './layout';

/** Simulated clock. Every test names its anchor explicitly — nothing reads the real one. */
const anchorAt = (hhmm: string, day = '2026-09-01'): Date => new Date(`${day}T${hhmm}:00`);

const byId = (blocks: ScheduledBlock[], id: string): ScheduledBlock => {
  const found = blocks.find((block) => block.blockId === id);
  if (!found) throw new Error(`No block ${id}`);
  return found;
};

const span = (block: ScheduledBlock): string =>
  `${toHHMM(block.startsAt)}–${toHHMM(block.endsAt)}`;

describe('layoutDay — normal anchor', () => {
  const blocks = layoutDay(anchorAt('05:45'), FULL_DAY, FIXED_WINDOWS);

  it('starts the first block at the anchor, not at a clock time', () => {
    expect(toHHMM(blocks[0]!.startsAt)).toBe('05:45');
    expect(blocks[0]!.blockId).toBe('wake');
  });

  it('lays blocks end to end from the anchor', () => {
    expect(span(byId(blocks, 'gym'))).toBe('06:00–06:35');
    expect(span(byId(blocks, 'recall'))).toBe('07:45–08:05');
    expect(span(byId(blocks, 'dsa_deep'))).toBe('08:05–11:05');
    expect(span(byId(blocks, 'spring_1'))).toBe('11:20–13:00');
  });

  it('leaves no gaps when the template meets its windows cleanly', () => {
    expect(blocks.filter((block) => block.kind === 'gap')).toHaveLength(0);
  });

  it('places all three meals inside their windows', () => {
    for (const id of ['breakfast', 'lunch', 'dinner']) {
      expect(byId(blocks, id).missedWindow).toBe(false);
    }
    expect(span(byId(blocks, 'breakfast'))).toBe('07:15–07:45');
    expect(span(byId(blocks, 'lunch'))).toBe('13:00–14:00');
    expect(span(byId(blocks, 'dinner'))).toBe('20:00–21:00');
  });

  it('runs to the soft day end', () => {
    expect(toHHMM(blocks[blocks.length - 1]!.endsAt)).toBe('22:45');
  });

  it('marks every block pending with no actual end', () => {
    expect(blocks.every((block) => block.status === 'pending')).toBe(true);
    expect(blocks.every((block) => block.actualEndedAt === null)).toBe(true);
  });
});

describe('layoutDay — meal window collision', () => {
  // Anchored 45 min early, so the routine run finishes before the mess opens.
  const blocks = layoutDay(anchorAt('05:00'), FULL_DAY, FIXED_WINDOWS);

  it('idles forward to the window and emits the wait as a gap', () => {
    const gap = byId(blocks, 'gap:breakfast');
    expect(gap.kind).toBe('gap');
    expect(span(gap)).toBe('06:30–07:00');
    expect(gap.minutes).toBe(30);
  });

  it('places the meal at the window opening, not at the cursor', () => {
    expect(span(byId(blocks, 'breakfast'))).toBe('07:00–07:30');
    expect(byId(blocks, 'breakfast').missedWindow).toBe(false);
  });

  it('orders the gap immediately before the meal it waits for', () => {
    const gapIndex = blocks.findIndex((block) => block.blockId === 'gap:breakfast');
    expect(blocks[gapIndex + 1]!.blockId).toBe('breakfast');
  });

  it('does not split a work block that runs across a window opening', () => {
    // dsa_deep runs 07:50–10:50 here; it is left whole and the straddle recorded.
    const dsa = byId(blocks, 'dsa_deep');
    expect(dsa.minutes).toBe(180);
    expect(blocks.filter((block) => block.blockId === 'dsa_deep')).toHaveLength(1);
  });
});

describe('layoutDay — past-window meal', () => {
  const blocks = layoutDay(anchorAt('10:00'), FULL_DAY, FIXED_WINDOWS);

  it('flags a meal placed after its window closed', () => {
    const breakfast = byId(blocks, 'breakfast');
    expect(breakfast.missedWindow).toBe(true);
    expect(span(breakfast)).toBe('11:30–12:00');
  });

  it('places it at the cursor rather than pretending the mess is open', () => {
    const ready = byId(blocks, 'ready');
    expect(byId(blocks, 'breakfast').startsAt).toBe(ready.endsAt);
  });

  it('emits no gap for a window that is already shut', () => {
    expect(blocks.some((block) => block.blockId === 'gap:breakfast')).toBe(false);
  });

  it('records a straddle when a work block runs across a window opening', () => {
    // spring_1 runs 15:20–17:00 — no window. dsa_deep 12:20–15:20 crosses lunch at 13:00.
    expect(byId(blocks, 'dsa_deep').straddles).toBe('lunch');
  });
});

describe('layoutDay — lateNight template', () => {
  const blocks = layoutDay(anchorAt('16:00'), LATE_NIGHT, FIXED_WINDOWS);

  it('still puts DSA before anything else — Rule 1 is "first today", not "at 08:05"', () => {
    expect(blocks[0]!.blockId).toBe('recall');
    expect(blocks[1]!.blockId).toBe('dsa_deep');
    expect(span(byId(blocks, 'dsa_deep'))).toBe('16:20–18:20');
  });

  it('lands dinner inside its window without idling', () => {
    expect(span(byId(blocks, 'dinner'))).toBe('20:35–21:20');
    expect(byId(blocks, 'dinner').missedWindow).toBe(false);
  });

  it('carries no gym, no flex, and keeps the log', () => {
    expect(blocks.some((block) => block.blockId === 'gym')).toBe(false);
    expect(blocks.some((block) => block.blockId === 'flex')).toBe(false);
    expect(blocks.some((block) => block.blockId === 'log')).toBe(true);
  });
});

describe('layoutDay — determinism', () => {
  it('produces identical output for identical input', () => {
    const a = layoutDay(anchorAt('06:10'), FULL_DAY, FIXED_WINDOWS);
    const b = layoutDay(anchorAt('06:10'), FULL_DAY, FIXED_WINDOWS);
    expect(a).toEqual(b);
  });

  it('does not mutate the template it is given', () => {
    const snapshot = JSON.parse(JSON.stringify(FULL_DAY));
    layoutDay(anchorAt('06:10'), FULL_DAY, FIXED_WINDOWS);
    expect(FULL_DAY).toEqual(snapshot);
  });
});
