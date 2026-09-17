import { describe, expect, it } from 'vitest';
import { FOCUS_AREAS } from '../config/schedule.config';
import type { CommitmentRecord, DayRecord } from '../db/schema';
import { areaFor, focusSummary, peakIndex } from './focus';
import type { ScheduledBlock } from './layout';
import type { Period } from './pacing';

const BLOCK_TAGS = { dsa_deep: ['dsa', 'dsa_new'], spring_1: ['spring'], core_cse: ['core_cse'] };

const block = (
  date: string,
  blockId: string,
  from: string,
  to: string,
  over: Partial<ScheduledBlock> = {},
): ScheduledBlock => {
  const startsAt = Date.parse(`${date}T${from}:00`);
  const endsAt = Date.parse(`${date}T${to}:00`);
  return {
    blockId,
    label: blockId,
    detail: null,
    kind: 'work',
    priority: 1,
    minutes: (endsAt - startsAt) / 60_000,
    startsAt,
    endsAt,
    status: 'contained',
    actualEndedAt: endsAt,
    missedWindow: false,
    straddles: null,
    window: null,
    ...over,
  };
};

const day = (date: string, blocks: ScheduledBlock[], started = true): DayRecord => ({
  date,
  anchorAt: started ? Date.parse(`${date}T07:00:00`) : null,
  template: 'full',
  blocks,
  degradation: [],
  pushes: [],
  placementMode: false,
  score: null,
  band: null,
  gatePassed: null,
  plannedAt: Date.parse(`${date}T06:00:00`),
  plannedBlocks: null,
  plannedAnchor: null,
});

const commitment = (over: Partial<CommitmentRecord>): CommitmentRecord => ({
  id: Math.random().toString(36),
  dayDate: '2026-09-14',
  blockId: 'dsa_deep',
  label: 'x',
  targetType: 'count',
  target: 4,
  done: 4,
  plannedMinutes: 120,
  tags: ['dsa', 'dsa_new'],
  status: 'complete',
  displacedBy: null,
  movedCount: 0,
  originDate: '2026-09-14',
  ...over,
});

const summary = (period: Partial<Period>, from = '2026-09-01', to = '2026-09-30', asOf = '2026-09-20') =>
  focusSummary({ days: [], commitments: [], logs: [], ...period }, from, to, asOf, FOCUS_AREAS, BLOCK_TAGS);

describe('focus — areas', () => {
  it('counts a commitment once, under the first area its tags name', () => {
    expect(areaFor(['dsa', 'dsa_new'], 'dsa_deep', FOCUS_AREAS, BLOCK_TAGS)).toBe('DSA');
  });

  it('gives an untagged commitment its block\'s area', () => {
    expect(areaFor([], 'spring_1', FOCUS_AREAS, BLOCK_TAGS)).toBe('Spring Boot');
  });

  it('lets an unknown tag name itself, and only nothing at all is untagged', () => {
    expect(areaFor(['thesis'], null, FOCUS_AREAS, BLOCK_TAGS)).toBe('thesis');
    expect(areaFor([], null, FOCUS_AREAS, BLOCK_TAGS)).toBe('Untagged');
    expect(areaFor([], 'unknown_block', FOCUS_AREAS, BLOCK_TAGS)).toBe('Untagged');
  });
});

describe('focus — per day', () => {
  it('measures earned minutes: planned times completion', () => {
    const result = summary({
      days: [day('2026-09-14', [block('2026-09-14', 'dsa_deep', '09:00', '11:00')])],
      commitments: [commitment({ done: 2, status: 'partial' })],
    });
    expect(result.byDay.find((entry) => entry.date === '2026-09-14')?.minutes).toBe(60);
    expect(result.totalMinutes).toBe(60);
  });

  it('draws every date in the range, and nothing after today', () => {
    const result = summary({});
    expect(result.byDay).toHaveLength(30);
    expect(result.byDay.find((entry) => entry.date === '2026-09-20')?.minutes).toBe(0);
    expect(result.byDay.find((entry) => entry.date === '2026-09-21')?.minutes).toBeNull();
  });

  it('counts a worked block with no commitment, and never a block twice', () => {
    const worked = block('2026-09-14', 'core_cse', '14:00', '16:00', { workedMinutes: 90 });
    const committed = block('2026-09-14', 'dsa_deep', '09:00', '11:00', { workedMinutes: 120 });
    const result = summary({
      days: [day('2026-09-14', [worked, committed])],
      commitments: [commitment({})],
    });
    // 120 earned on the DSA commitment, plus 90 logged on the uncommitted Core CSE block.
    expect(result.totalMinutes).toBe(210);
    expect(result.areas).toEqual([
      { label: 'DSA', minutes: 120, share: 57 },
      { label: 'Core CSE', minutes: 90, share: 43 },
    ]);
  });

  it('leaves displaced work out entirely', () => {
    const result = summary({
      days: [day('2026-09-14', [block('2026-09-14', 'dsa_deep', '09:00', '11:00')])],
      commitments: [commitment({ status: 'displaced' })],
    });
    expect(result.totalMinutes).toBe(0);
  });
});

describe('focus — by weekday', () => {
  it('averages over started days only, Monday first', () => {
    const result = summary({
      days: [
        day('2026-09-14', [block('2026-09-14', 'dsa_deep', '09:00', '11:00')]), // Monday
        day('2026-09-07', [block('2026-09-07', 'dsa_deep', '09:00', '11:00')]), // Monday
        day('2026-09-15', [], false), // Tuesday, never started
      ],
      commitments: [
        commitment({ dayDate: '2026-09-14', plannedMinutes: 180 }),
        commitment({ dayDate: '2026-09-07', plannedMinutes: 60 }),
      ],
    });
    expect(result.byWeekday[0]).toEqual({ day: 'Mon', average: 120, days: 2 });
    expect(result.byWeekday[1]).toEqual({ day: 'Tue', average: null, days: 0 });
  });
});

describe('focus — by hour', () => {
  it('spreads a block\'s minutes over the hours it spans', () => {
    const result = summary({
      days: [day('2026-09-14', [block('2026-09-14', 'dsa_deep', '09:30', '11:30')])],
      commitments: [commitment({ plannedMinutes: 120 })],
    });
    expect(result.byHour[9]).toBe(30);
    expect(result.byHour[10]).toBe(60);
    expect(result.byHour[11]).toBe(30);
    expect(result.byHour.reduce((sum, value) => sum + value, 0)).toBe(120);
  });

  it('keeps work with no block out of the hours, and says how much', () => {
    const result = summary({
      days: [day('2026-09-14', [])],
      commitments: [commitment({ blockId: null })],
    });
    expect(result.byHour.every((value) => value === 0)).toBe(true);
    expect(result.unplacedMinutes).toBe(120);
    expect(result.totalMinutes).toBe(120);
  });
});

describe('focus — the split', () => {
  it('folds the long tail into Other', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const result = focusSummary(
      {
        days: [day('2026-09-14', [])],
        commitments: tags.map((tag, index) =>
          commitment({ tags: [tag], blockId: null, plannedMinutes: 100 - index }),
        ),
        logs: [],
      },
      '2026-09-01',
      '2026-09-30',
      '2026-09-20',
      FOCUS_AREAS,
      BLOCK_TAGS,
      5,
    );
    expect(result.areas.map((slice) => slice.label)).toEqual(['a', 'b', 'c', 'd', 'e', 'Other']);
    expect(result.areas.at(-1)?.minutes).toBe(94 + 95);
  });
});

describe('focus — peak', () => {
  it('finds the largest, ignoring gaps and zeros', () => {
    expect(peakIndex([null, 10, 40, 0, 40])).toBe(2);
    expect(peakIndex([0, null, 0])).toBeNull();
  });
});
