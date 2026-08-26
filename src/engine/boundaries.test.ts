import { describe, expect, it } from 'vitest';
import { FIXED_WINDOWS, FULL_DAY } from '../config/schedule.config';
import { toHHMM } from '../lib/time';
import {
  allowedCorrections,
  blockAt,
  containment,
  freeMinutesUntilNext,
  isDayComplete,
  nextBlock,
  pullForward,
  pushRemaining,
  resolveBlock,
  unconfirmed,
  viewStatus,
} from './boundaries';
import { layoutDay, type ScheduledBlock } from './layout';

const DAY = '2026-09-01';
const at = (hhmm: string): number => new Date(`${DAY}T${hhmm}:00`).getTime();

/** Anchored 05:45: wake 05:45, dsa_deep 08:05–11:05, break_1 11:05–11:20. */
const laid = (): ScheduledBlock[] => layoutDay(new Date(at('05:45')), FULL_DAY, FIXED_WINDOWS);

const find = (blocks: ScheduledBlock[], id: string): ScheduledBlock => {
  const block = blocks.find((entry) => entry.blockId === id);
  if (!block) throw new Error(`No block ${id}`);
  return block;
};

const span = (blocks: ScheduledBlock[], id: string): string => {
  const block = find(blocks, id);
  return `${toHHMM(block.startsAt)}–${toHHMM(block.endsAt)}`;
};

describe('viewStatus', () => {
  const blocks = laid();

  it('reads the clock for unresolved blocks', () => {
    const dsa = find(blocks, 'dsa_deep');
    expect(viewStatus(dsa, at('07:00'))).toBe('pending');
    expect(viewStatus(dsa, at('09:00'))).toBe('active');
    expect(viewStatus(dsa, at('11:05'))).toBe('awaiting');
  });

  it('does not award containment nobody confirmed', () => {
    // The block's time is up and the user has not answered. Not contained, not yet overran.
    expect(viewStatus(find(blocks, 'dsa_deep'), at('12:00'))).toBe('awaiting');
  });

  it('holds a resolved status regardless of the clock', () => {
    const resolved = resolveBlock(blocks, 'dsa_deep', 'contained', at('10:50'));
    expect(viewStatus(find(resolved, 'dsa_deep'), at('23:00'))).toBe('contained');
  });
});

describe('blockAt / nextBlock', () => {
  const blocks = laid();

  it('finds the block whose window contains now', () => {
    expect(blockAt(blocks, at('09:00'))?.blockId).toBe('dsa_deep');
    expect(blockAt(blocks, at('05:00'))).toBeNull();
  });

  it('treats a boundary as belonging to the block that starts on it', () => {
    expect(blockAt(blocks, at('11:05'))?.blockId).toBe('break_1');
  });

  it('skips gaps when naming the next block', () => {
    const early = layoutDay(new Date(at('05:00')), FULL_DAY, FIXED_WINDOWS);
    expect(nextBlock(early, at('06:31'))?.blockId).toBe('breakfast');
  });
});

describe('unconfirmed', () => {
  it('lists ended blocks the user has not answered for, oldest first', () => {
    const blocks = laid();
    const waiting = unconfirmed(blocks, at('08:10')).map((block) => block.blockId);
    expect(waiting).toEqual(['wake', 'gym', 'ready', 'breakfast', 'recall']);
  });

  it('drops a block once it is resolved', () => {
    const blocks = resolveBlock(laid(), 'wake', 'contained', at('06:00'));
    expect(unconfirmed(blocks, at('08:10')).map((block) => block.blockId)).not.toContain('wake');
  });

  it('never asks about a gap', () => {
    const early = layoutDay(new Date(at('05:00')), FULL_DAY, FIXED_WINDOWS);
    expect(unconfirmed(early, at('12:00')).some((block) => block.kind === 'gap')).toBe(false);
  });
});

describe('pushRemaining', () => {
  const pushed = pushRemaining(laid(), at('08:30'), 30);

  it('gives the time to the block in progress', () => {
    expect(span(pushed, 'dsa_deep')).toBe('08:05–11:35');
    expect(find(pushed, 'dsa_deep').minutes).toBe(210);
  });

  it('moves every later boundary by the same amount', () => {
    expect(span(pushed, 'break_1')).toBe('11:35–11:50');
    expect(span(pushed, 'winddown')).toBe('22:30–23:15');
  });

  it('leaves blocks that already finished alone', () => {
    expect(span(pushed, 'wake')).toBe('05:45–06:00');
    expect(span(pushed, 'recall')).toBe('07:45–08:05');
  });

  it('moves only what is still to come when nothing is in progress', () => {
    const gapPush = pushRemaining(
      resolveBlock(laid(), 'dsa_deep', 'contained', at('10:00')),
      at('10:00'),
      15,
    );
    expect(span(gapPush, 'dsa_deep')).toBe('08:05–11:05');
    expect(span(gapPush, 'break_1')).toBe('11:20–11:35');
  });
});

describe('pullForward', () => {
  it('moves every remaining boundary earlier', () => {
    const done = resolveBlock(laid(), 'dsa_deep', 'contained', at('10:00'));
    const free = freeMinutesUntilNext(done, at('10:00'));
    expect(free).toBe(65);

    const pulled = pullForward(done, at('10:00'), free);
    expect(span(pulled, 'break_1')).toBe('10:00–10:15');
    expect(span(pulled, 'winddown')).toBe('20:55–21:40');
  });

  it('does not touch a block that has already started', () => {
    const pulled = pullForward(laid(), at('10:00'), 30);
    expect(span(pulled, 'dsa_deep')).toBe('08:05–11:05');
  });

  it('refuses to move anything backwards', () => {
    const blocks = laid();
    expect(pullForward(blocks, at('10:00'), 0)).toEqual(blocks);
    expect(pullForward(blocks, at('10:00'), -30)).toEqual(blocks);
  });
});

describe('skipping leaves a hole', () => {
  const skipped = resolveBlock(laid(), 'dsa_deep', 'skipped', at('09:00'));

  it('moves no boundary — Rule 4, no cascading', () => {
    expect(span(skipped, 'break_1')).toBe('11:05–11:20');
    expect(span(skipped, 'dsa_deep')).toBe('08:05–11:05');
  });

  it('ends the block at its boundary, not at the moment it was skipped', () => {
    expect(find(skipped, 'dsa_deep').actualEndedAt).toBe(at('11:05'));
  });
});

describe('containment', () => {
  it('has no percentage before anything is resolved', () => {
    expect(containment(laid())).toEqual({ contained: 0, total: 0, percent: null });
  });

  it('counts a skipped block against containment', () => {
    let blocks = resolveBlock(laid(), 'wake', 'contained', at('06:00'));
    blocks = resolveBlock(blocks, 'gym', 'skipped', at('06:35'));
    expect(containment(blocks)).toEqual({ contained: 1, total: 2, percent: 50 });
  });

  it('counts an overrun against containment', () => {
    let blocks = resolveBlock(laid(), 'wake', 'contained', at('06:00'));
    blocks = resolveBlock(blocks, 'gym', 'contained', at('06:35'));
    blocks = resolveBlock(blocks, 'ready', 'overran', at('07:30'));
    expect(containment(blocks).percent).toBe(67);
  });

  it('ignores gaps', () => {
    const early = layoutDay(new Date(at('05:00')), FULL_DAY, FIXED_WINDOWS);
    const blocks = resolveBlock(early, 'wake', 'contained', at('05:15'));
    expect(containment(blocks).total).toBe(1);
  });
});

describe('allowedCorrections', () => {
  it('never converts a skip into a containment', () => {
    expect(allowedCorrections('skipped')).toEqual([]);
  });

  it('never converts an overrun into a containment', () => {
    expect(allowedCorrections('overran')).toEqual(['skipped']);
  });

  it('lets an honest correction downgrade a containment', () => {
    expect(allowedCorrections('contained')).toEqual(['overran', 'skipped']);
  });

  it('offers nothing for a block that has not been resolved', () => {
    expect(allowedCorrections('pending')).toEqual([]);
    expect(allowedCorrections('active')).toEqual([]);
  });
});

describe('isDayComplete', () => {
  it('is false while any actionable block is unresolved', () => {
    expect(isDayComplete(laid())).toBe(false);
  });

  it('ignores gaps when deciding the day is worked', () => {
    const early = layoutDay(new Date(at('05:00')), FULL_DAY, FIXED_WINDOWS);
    const worked = early.reduce<ScheduledBlock[]>(
      (blocks, block) =>
        block.kind === 'gap' ? blocks : resolveBlock(blocks, block.blockId, 'contained', 0),
      early,
    );
    expect(isDayComplete(worked)).toBe(true);
  });
});
