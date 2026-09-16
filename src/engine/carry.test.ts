import { describe, expect, it } from 'vitest';
import { COMMITMENT_PRESETS } from '../config/schedule.config';
import type { CommitmentRecord } from '../db/schema';
import { carryOverPool, isRoutine, weightFor } from './carry';

const commitment = (over: Partial<CommitmentRecord> = {}): CommitmentRecord => ({
  id: 'c',
  dayDate: '2026-09-15',
  blockId: 'spring_1',
  label: 'Spring Boot — JPA',
  targetType: 'minutes',
  target: 100,
  done: 60,
  plannedMinutes: 100,
  tags: ['spring'],
  status: 'partial',
  displacedBy: null,
  movedCount: 0,
  originDate: '2026-09-15',
  ...over,
});

const week = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15'];

describe('carry — what counts as routine', () => {
  it('trusts the recorded flag either way', () => {
    expect(isRoutine(commitment({ routine: true, blockId: 'nowhere', tags: [] }), COMMITMENT_PRESETS)).toBe(true);
    expect(isRoutine(commitment({ routine: false }), COMMITMENT_PRESETS)).toBe(false);
  });

  it('judges an old commitment by the preset it matches', () => {
    expect(isRoutine(commitment(), COMMITMENT_PRESETS)).toBe(true);
    expect(
      isRoutine(
        commitment({ blockId: 'dsa_deep', targetType: 'count', tags: ['dsa_new', 'dsa'] }),
        COMMITMENT_PRESETS,
      ),
    ).toBe(true);
  });

  it('treats anything off-preset as a one-off', () => {
    // Right block, wrong type: a task, not the daily session.
    expect(
      isRoutine(commitment({ blockId: 'flex', targetType: 'binary', tags: [] }), COMMITMENT_PRESETS),
    ).toBe(false);
    // Right block and type, different tags.
    expect(isRoutine(commitment({ tags: ['spring', 'cv'] }), COMMITMENT_PRESETS)).toBe(false);
  });
});

describe('carry — the pool', () => {
  it('no longer piles up a week of daily sessions', () => {
    // The reported case: a Spring Boot session left short every day for six days.
    const past = week.map((date) =>
      commitment({ id: `s-${date}`, dayDate: date, originDate: date }),
    );
    const pool = carryOverPool(past, '2026-09-16', COMMITMENT_PRESETS);
    expect(pool.carry).toEqual([]);
    expect(pool.routineLeftShort).toBe(6);
  });

  it('still carries work added by hand', () => {
    const task = commitment({
      id: 'cv',
      blockId: 'flex',
      label: 'Rewrite CV project section',
      targetType: 'binary',
      target: 1,
      done: 0,
      plannedMinutes: 45,
      tags: [],
      status: 'open',
      routine: false,
    });
    const pool = carryOverPool([task, commitment({ id: 'daily' })], '2026-09-16', COMMITMENT_PRESETS);
    expect(pool.carry.map((entry) => entry.id)).toEqual(['cv']);
    expect(pool.routineLeftShort).toBe(1);
  });

  it('offers one line per piece of work, the latest copy', () => {
    const carried = [
      commitment({ id: 'a', dayDate: '2026-09-13', originDate: '2026-09-13', label: 'Task', routine: false }),
      commitment({ id: 'b', dayDate: '2026-09-14', originDate: '2026-09-13', label: 'Task', routine: false, movedCount: 1 }),
    ];
    const pool = carryOverPool(carried, '2026-09-16', COMMITMENT_PRESETS);
    expect(pool.carry.map((entry) => entry.id)).toEqual(['b']);
  });

  it('leaves out finished, dropped, retired and future work', () => {
    const pool = carryOverPool(
      [
        commitment({ id: 'done', routine: false, status: 'complete' }),
        commitment({ id: 'skipped', routine: false, status: 'skipped' }),
        commitment({ id: 'retired', routine: false, retiredAt: 1 }),
        commitment({ id: 'tomorrow', routine: false, dayDate: '2026-09-16' }),
      ],
      '2026-09-16',
      COMMITMENT_PRESETS,
    );
    expect(pool.carry).toEqual([]);
    expect(pool.routineLeftShort).toBe(0);
  });

  it('puts the most-moved first', () => {
    const pool = carryOverPool(
      [
        commitment({ id: 'once', label: 'A', routine: false, movedCount: 0 }),
        commitment({ id: 'twice', label: 'B', routine: false, movedCount: 2 }),
      ],
      '2026-09-16',
      COMMITMENT_PRESETS,
    );
    expect(pool.carry.map((entry) => entry.id)).toEqual(['twice', 'once']);
  });
});

describe('carry — one number for minutes', () => {
  it('weighs a minutes commitment at its target, whatever was typed as weight', () => {
    expect(weightFor('minutes', 120, 90)).toBe(120);
  });

  it('keeps a count or done-or-not commitment its own time', () => {
    expect(weightFor('count', 4, 120)).toBe(120);
    expect(weightFor('binary', 1, 45)).toBe(45);
  });

  it('never goes negative', () => {
    expect(weightFor('count', 4, -5)).toBe(0);
  });
});
