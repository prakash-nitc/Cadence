import { describe, expect, it } from 'vitest';
import type { TargetSource } from '../config/schedule.config';
import type { CommitmentRecord, DayRecord } from '../db/schema';
import type { ScheduledBlock } from './layout';
import { measure, type Period } from './pacing';
import {
  clampWorked,
  defaultWorked,
  spreadWorked,
  timeHeldByCommitment,
  withWorked,
} from './worked';

const DATE = '2026-09-16';
const at = (hhmm: string) => Date.parse(`${DATE}T${hhmm}:00`);

const block = (over: Partial<ScheduledBlock> = {}): ScheduledBlock => ({
  blockId: 'core_cse',
  label: 'Core CSE',
  detail: null,
  kind: 'work',
  priority: 1,
  minutes: 180,
  startsAt: at('10:00'),
  endsAt: at('13:00'),
  status: 'pending',
  actualEndedAt: null,
  missedWindow: false,
  straddles: null,
  window: null,
  ...over,
});

const commitment = (over: Partial<CommitmentRecord> = {}): CommitmentRecord => ({
  id: 'c1',
  dayDate: DATE,
  blockId: 'core_cse',
  label: 'SQL',
  targetType: 'minutes',
  target: 120,
  done: 0,
  plannedMinutes: 120,
  tags: ['core_cse'],
  status: 'open',
  displacedBy: null,
  movedCount: 0,
  originDate: DATE,
  ...over,
});

const day = (blocks: ScheduledBlock[], date = DATE): DayRecord => ({
  date,
  anchorAt: at('07:00'),
  template: 'full',
  blocks,
  degradation: [],
  pushes: [],
  placementMode: false,
  score: null,
  band: null,
  gatePassed: null,
  plannedAt: at('06:00'),
  plannedBlocks: null,
  plannedAnchor: null,
});

const CSE_HOURS: TargetSource = { kind: 'minutesTag', tag: 'core_cse', blocks: ['core_cse'] };

describe('worked — the first answer offered', () => {
  it('offers the time so far when a block is closed while still running', () => {
    // Two hours into a three-hour block: the partial case.
    expect(defaultWorked(block(), at('12:00'))).toBe(120);
  });

  it('rounds to the picker step', () => {
    expect(defaultWorked(block(), at('11:08'))).toBe(75);
  });

  it('offers the whole block once it has ended', () => {
    expect(defaultWorked(block(), at('13:40'))).toBe(180);
  });

  it('never offers more than the block, or less than nothing', () => {
    expect(defaultWorked(block({ startsAt: at('10:00') }), at('09:30'))).toBe(0);
    expect(clampWorked(-20)).toBe(0);
    expect(clampWorked(10_000)).toBe(960);
  });
});

describe('worked — written onto the block', () => {
  it('sets only the named block', () => {
    const blocks = [block(), block({ blockId: 'lunch', kind: 'meal' })];
    const next = withWorked(blocks, 'core_cse', 120);
    expect(next.map((entry) => entry.workedMinutes)).toEqual([120, undefined]);
  });
});

describe('worked — flowed into commitments', () => {
  it('gives one minutes commitment all of it, and settles its status', () => {
    const [changed] = spreadWorked([commitment()], DATE, 'core_cse', 120);
    expect(changed?.done).toBe(120);
    expect(changed?.status).toBe('complete');
  });

  it('marks two hours of a three-hour target as partial, not complete', () => {
    const [changed] = spreadWorked([commitment({ target: 180 })], DATE, 'core_cse', 120);
    expect(changed?.done).toBe(120);
    expect(changed?.status).toBe('partial');
  });

  it('shares between several in proportion to their targets, summing exactly', () => {
    const changed = spreadWorked(
      [commitment({ id: 'a', target: 120 }), commitment({ id: 'b', target: 60 })],
      DATE,
      'core_cse',
      100,
    );
    expect(changed.map((entry) => entry.done)).toEqual([67, 33]);
    expect(changed.reduce((sum, entry) => sum + entry.done, 0)).toBe(100);
  });

  it('leaves count, dropped and other-block commitments alone', () => {
    const changed = spreadWorked(
      [
        commitment({ id: 'count', targetType: 'count', target: 4 }),
        commitment({ id: 'skipped', status: 'skipped' }),
        commitment({ id: 'elsewhere', blockId: 'spring_1' }),
        commitment({ id: 'yesterday', dayDate: '2026-09-15' }),
      ],
      DATE,
      'core_cse',
      120,
    );
    expect(changed).toEqual([]);
  });

  it('lowers a figure too — the answer at close is the answer', () => {
    const [changed] = spreadWorked([commitment({ done: 120 })], DATE, 'core_cse', 45);
    expect(changed?.done).toBe(45);
  });
});

describe('worked — counted toward hours targets', () => {
  it('counts a closed block that has no commitment on it', () => {
    const period: Period = {
      days: [day([block({ status: 'contained', workedMinutes: 120 })])],
      commitments: [],
      logs: [],
    };
    expect(measure(CSE_HOURS, period)).toBe(2);
  });

  it('does not count the same time twice when a commitment already holds it', () => {
    const period: Period = {
      days: [day([block({ status: 'contained', workedMinutes: 120 })])],
      commitments: [commitment({ done: 120 })],
      logs: [],
    };
    expect(measure(CSE_HOURS, period)).toBe(2);
  });

  it('reads only the blocks the target names', () => {
    const period: Period = {
      days: [day([block({ blockId: 'spring_1', status: 'contained', workedMinutes: 120 })])],
      commitments: [],
      logs: [],
    };
    expect(measure(CSE_HOURS, period)).toBe(0);
  });

  it('adds block time across days', () => {
    const period: Period = {
      days: [
        day([block({ status: 'contained', workedMinutes: 120 })], '2026-09-14'),
        day([block({ status: 'overran', workedMinutes: 90 })], '2026-09-15'),
      ],
      commitments: [],
      logs: [],
    };
    expect(measure(CSE_HOURS, period)).toBe(3.5);
  });

  it('knows when a block is already held', () => {
    expect(timeHeldByCommitment([commitment()], DATE, 'core_cse')).toBe(true);
    expect(timeHeldByCommitment([commitment({ status: 'displaced' })], DATE, 'core_cse')).toBe(false);
    expect(timeHeldByCommitment([commitment({ targetType: 'count' })], DATE, 'core_cse')).toBe(false);
  });

  it('leaves a target without named blocks exactly as it was', () => {
    const period: Period = {
      days: [day([block({ status: 'contained', workedMinutes: 120 })])],
      commitments: [],
      logs: [],
    };
    expect(measure({ kind: 'minutesTag', tag: 'core_cse' }, period)).toBe(0);
  });
});
