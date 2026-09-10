import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../config/schedule.config';
import type {
  CommitmentRecord,
  DayRecord,
  InterruptionReason,
  LogRecord,
} from '../db/schema';
import type { ScheduledBlock } from './layout';
import { daysUntilInsights, insights } from './insights';
import type { Period } from './pacing';

const prefs = DEFAULT_PREFS;

const block = (
  id: string,
  date: string,
  hhmm: string,
  status: ScheduledBlock['status'],
): ScheduledBlock => {
  const startsAt = Date.parse(`${date}T${hhmm}:00`);
  return {
    blockId: id,
    label: id,
    detail: null,
    kind: 'work',
    priority: 0,
    minutes: 60,
    startsAt,
    endsAt: startsAt + 3_600_000,
    status,
    actualEndedAt: startsAt + 3_600_000,
    missedWindow: false,
    straddles: null,
    window: null,
  };
};

const day = (date: string, blocks: ScheduledBlock[], extra: Partial<DayRecord> = {}): DayRecord => ({
  date,
  anchorAt: Date.parse(`${date}T06:30:00`),
  template: 'full',
  blocks,
  degradation: [],
  pushes: [],
  placementMode: false,
  score: null,
  band: null,
  gatePassed: null,
  plannedAt: Date.parse(`${date}T22:00:00`),
  plannedBlocks: null,
  plannedAnchor: null,
  ...extra,
});

const log = (date: string, sleepHours: number, energy: LogRecord['energy']): LogRecord => ({
  date,
  recallDrillDone: true,
  sleepHours,
  energy,
  hardestThing: '',
  blocksContained: 0,
  blocksTotal: 0,
  createdAt: 0,
});

/** A commitment worth `done` of `target`, so the day scores a known percentage. */
const commitment = (date: string, done: number, target = 4): CommitmentRecord => ({
  id: `${date}-c`,
  dayDate: date,
  blockId: null,
  label: 'work',
  targetType: 'count',
  target,
  done,
  plannedMinutes: 100,
  tags: [],
  status: 'open',
  displacedBy: null,
  movedCount: 0,
  originDate: date,
});

const dates = (count: number, from = 1): string[] =>
  Array.from({ length: count }, (_, index) => `2026-09-${String(from + index).padStart(2, '0')}`);

const period = (over: Partial<Period>): Period => ({
  days: [],
  commitments: [],
  logs: [],
  ...over,
});

describe('insights — part of day', () => {
  it('names the gap when one part of the day plainly holds better', () => {
    // Mornings contained, evenings not, six blocks each: past both thresholds.
    const days = dates(6).map((date) =>
      day(date, [
        block('m', date, '08:00', 'contained'),
        block('e', date, '19:00', 'overran'),
      ]),
    );

    const found = insights(period({ days }), prefs, '2026-09-06');
    const part = found.find((insight) => insight.key === 'partOfDay');
    expect(part?.headline).toMatch(/morning blocks hold/i);
    expect(part?.detail).toMatch(/100% contained in the morning, 0% in the evening/);
  });

  it('says nothing when there are too few blocks to mean anything', () => {
    const days = dates(2).map((date) =>
      day(date, [
        block('m', date, '08:00', 'contained'),
        block('e', date, '19:00', 'overran'),
      ]),
    );
    expect(insights(period({ days }), prefs, '2026-09-02')).toEqual([]);
  });

  it('says nothing when the gap is real but not worth acting on', () => {
    // Eight morning blocks, seven contained; eight evening, six contained. 88% vs 75%.
    const days = dates(8).map((date, index) =>
      day(date, [
        block('m', date, '08:00', index === 0 ? 'overran' : 'contained'),
        block('e', date, '19:00', index < 2 ? 'overran' : 'contained'),
      ]),
    );
    const found = insights(period({ days }), prefs, '2026-09-08');
    expect(found.find((insight) => insight.key === 'partOfDay')).toBeUndefined();
  });

  it('ignores blocks nobody answered for', () => {
    // Pending blocks are not failures; they are silence.
    const days = dates(6).map((date) =>
      day(date, [
        block('m', date, '08:00', 'contained'),
        block('e', date, '19:00', 'pending'),
      ]),
    );
    const found = insights(period({ days }), prefs, '2026-09-06');
    expect(found.find((insight) => insight.key === 'partOfDay')).toBeUndefined();
  });
});

describe('insights — sleep', () => {
  const eightDays = dates(8);

  it('splits at your own median rather than a number off a poster', () => {
    // Four short nights scoring 25%, four long scoring 100%.
    const days = eightDays.map((date) => day(date, []));
    const logs = eightDays.map((date, index) => log(date, index < 4 ? 5 : 8, 3));
    const commitments = eightDays.map((date, index) => commitment(date, index < 4 ? 1 : 4));

    const found = insights(period({ days, logs, commitments }), prefs, '2026-09-08');
    const sleep = found.find((insight) => insight.key === 'sleep');
    // Median of four 5s and four 8s is 6.5 — your own normal, not a round number.
    expect(sleep?.detail).toMatch(/Under 6\.5 hours your median day is 25%\. At or over it, 100%\./);
    expect(sleep?.sample).toBe(8);
  });

  it('says nothing on too few nights', () => {
    const days = dates(4).map((date) => day(date, []));
    const logs = dates(4).map((date, index) => log(date, index < 2 ? 5 : 8, 3));
    const commitments = dates(4).map((date, index) => commitment(date, index < 2 ? 1 : 4));
    const found = insights(period({ days, logs, commitments }), prefs, '2026-09-04');
    expect(found.find((insight) => insight.key === 'sleep')).toBeUndefined();
  });

  it('says nothing when sleep makes no difference', () => {
    const days = eightDays.map((date) => day(date, []));
    const logs = eightDays.map((date, index) => log(date, index < 4 ? 5 : 8, 3));
    const commitments = eightDays.map((date) => commitment(date, 4));
    const found = insights(period({ days, logs, commitments }), prefs, '2026-09-08');
    expect(found.find((insight) => insight.key === 'sleep')).toBeUndefined();
  });
});

describe('insights — interruptions', () => {
  const interruption = (date: string, hhmm: string, reason: InterruptionReason) => ({
    at: Date.parse(`${date}T${hhmm}:00`),
    blockId: 'dsa_deep',
    reason,
  });

  it('names what takes the most, and where', () => {
    const days = [
      day('2026-09-01', [], {
        interruptions: [
          interruption('2026-09-01', '14:00', 'messages'),
          interruption('2026-09-01', '15:00', 'messages'),
          interruption('2026-09-01', '16:00', 'messages'),
          interruption('2026-09-01', '14:30', 'messages'),
          interruption('2026-09-01', '09:00', 'someone'),
        ],
      }),
    ];

    const found = insights(period({ days }), prefs, '2026-09-01');
    const pulled = found.find((insight) => insight.key === 'interruptions');
    expect(pulled?.headline).toMatch(/^Messages takes most/);
    expect(pulled?.detail).toMatch(/4 of 5 interruptions, 80%\. Most of it in the afternoon\./);
  });

  it('says nothing from a handful', () => {
    const days = [
      day('2026-09-01', [], {
        interruptions: [interruption('2026-09-01', '14:00', 'messages')],
      }),
    ];
    expect(insights(period({ days }), prefs, '2026-09-01')).toEqual([]);
  });
});

describe('insights — the rules that govern the whole file', () => {
  it('returns nothing at all on an empty database', () => {
    expect(insights(period({}), prefs, '2026-09-01')).toEqual([]);
  });

  it('never reads days that have not happened', () => {
    const days = dates(6, 10).map((date) =>
      day(date, [
        block('m', date, '08:00', 'contained'),
        block('e', date, '19:00', 'overran'),
      ]),
    );
    // Every one of them is after the date being asked about.
    expect(insights(period({ days }), prefs, '2026-09-09')).toEqual([]);
  });

  it('ignores days that were never anchored', () => {
    const days = dates(6).map((date) =>
      day(date, [block('m', date, '08:00', 'contained')], { anchorAt: null }),
    );
    expect(insights(period({ days }), prefs, '2026-09-06')).toEqual([]);
  });

  it('carries its sample size, so a thin claim can be discounted', () => {
    const days = dates(6).map((date) =>
      day(date, [
        block('m', date, '08:00', 'contained'),
        block('e', date, '19:00', 'overran'),
      ]),
    );
    for (const insight of insights(period({ days }), prefs, '2026-09-06')) {
      expect(insight.sample).toBeGreaterThan(0);
    }
  });

  it('never scolds', () => {
    const days = dates(6).map((date) =>
      day(date, [
        block('m', date, '08:00', 'contained'),
        block('e', date, '19:00', 'overran'),
      ]),
    );
    for (const insight of insights(period({ days }), prefs, '2026-09-06')) {
      expect(`${insight.headline} ${insight.detail}`).not.toMatch(
        /!|you should|you must|you failed|lazy|excuse/i,
      );
    }
  });
});

describe('daysUntilInsights', () => {
  it('counts down from the largest minimum', () => {
    expect(daysUntilInsights(period({}), '2026-09-01')).toBe(8);
    expect(
      daysUntilInsights(period({ logs: dates(3).map((date) => log(date, 7, 3)) }), '2026-09-03'),
    ).toBe(5);
  });

  it('stops at zero rather than going negative', () => {
    const logs = dates(20).map((date) => log(date, 7, 3));
    expect(daysUntilInsights(period({ logs }), '2026-09-20')).toBe(0);
  });
});
