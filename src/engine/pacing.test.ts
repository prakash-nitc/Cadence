import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  WEEKLY_TARGETS,
  type Milestone,
  type WeeklyTarget,
} from '../config/schedule.config';
import type { CommitmentRecord, DayRecord, LogRecord } from '../db/schema';
import type { Prefs } from '../lib/prefs';
import {
  bandDays,
  milestoneStatuses,
  tagTotals,
  tallies,
  weeklyPacing,
  weekShape,
  type Period,
} from './pacing';

const prefs: Prefs = DEFAULT_PREFS;
const withPrefs = (over: Partial<Prefs>): Prefs => ({ ...prefs, ...over });

const day = (date: string, over: Partial<DayRecord> = {}): DayRecord => ({
  date,
  anchorAt: Date.parse(`${date}T05:45:00`),
  template: 'full',
  blocks: [],
  degradation: [],
  pushes: [],
  placementMode: false,
  score: null,
  band: null,
  gatePassed: null,
  plannedAt: Date.parse(`${date}T21:00:00`),
  ...over,
});

let seq = 0;
const c = (
  dayDate: string,
  plannedMinutes: number,
  target: number,
  done: number,
  over: Partial<CommitmentRecord> = {},
): CommitmentRecord => ({
  id: `c${seq++}`,
  dayDate,
  blockId: 'dsa_deep',
  label: 'work',
  targetType: 'count',
  target,
  done,
  plannedMinutes,
  tags: [],
  status: 'open',
  displacedBy: null,
  movedCount: 0,
  originDate: dayDate,
  ...over,
});

const log = (date: string, over: Partial<LogRecord> = {}): LogRecord => ({
  date,
  recallDrillDone: true,
  sleepHours: 7,
  energy: 3,
  hardestThing: '',
  blocksContained: 0,
  blocksTotal: 0,
  createdAt: 0,
  ...over,
});

/** A day scoring exactly `percent`, with both non-negotiables met. */
const dayAt = (date: string, percent: number): CommitmentRecord[] => [
  c(date, 20, 1, 1, { tags: ['recall'], blockId: 'recall' }),
  c(date, 20, 1, 1, { tags: ['log'], blockId: 'log' }),
  // 40 already earned; add weight w so (40 + w*p) / (40 + w) = percent.
  c(date, 960, 100, percent === 100 ? 100 : Math.round(((percent / 100) * 1000 - 40) / 9.6), {
    tags: ['dsa'],
  }),
];

describe('bandDays', () => {
  it('bands each day from its own commitments', () => {
    const period: Period = {
      days: [day('2026-09-01'), day('2026-09-02')],
      commitments: [...dayAt('2026-09-01', 100), ...dayAt('2026-09-02', 60)],
      logs: [],
    };
    const bands = bandDays(period, prefs);
    expect(bands.map((entry) => entry.band)).toEqual(['green', 'yellow']);
  });

  it('sorts by date regardless of input order', () => {
    const period: Period = {
      days: [day('2026-09-03'), day('2026-09-01'), day('2026-09-02')],
      commitments: [],
      logs: [],
    };
    expect(bandDays(period, prefs).map((entry) => entry.date)).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03',
    ]);
  });

  it('re-bands history when a threshold changes — Settings controls what it says it does', () => {
    const period: Period = {
      days: [day('2026-09-01')],
      commitments: dayAt('2026-09-01', 60),
      logs: [],
    };
    expect(bandDays(period, prefs)[0]?.band).toBe('yellow');
    expect(bandDays(period, withPrefs({ greenThreshold: 55 }))[0]?.band).toBe('green');
  });

  it('re-bands history when the gate is switched off', () => {
    const missedGate = [
      c('2026-09-01', 20, 1, 0, { tags: ['recall'] }),
      c('2026-09-01', 20, 1, 1, { tags: ['log'] }),
      c('2026-09-01', 360, 1, 1, { tags: ['dsa'] }),
    ];
    const period: Period = { days: [day('2026-09-01')], commitments: missedGate, logs: [] };

    expect(bandDays(period, prefs)[0]?.band).toBe('yellow');
    expect(bandDays(period, withPrefs({ nonNegotiableGate: false }))[0]?.band).toBe('green');
  });

  it('reds an unplanned day whatever got done', () => {
    const period: Period = {
      days: [day('2026-09-01', { plannedAt: null })],
      commitments: dayAt('2026-09-01', 100),
      logs: [],
    };
    expect(bandDays(period, prefs)[0]).toMatchObject({ band: 'red', score: null });
  });

  it('leaves a fully displaced day unbanded rather than red', () => {
    const period: Period = {
      days: [day('2026-09-01', { placementMode: true })],
      commitments: [
        c('2026-09-01', 180, 4, 0, { status: 'displaced', tags: ['dsa'] }),
        c('2026-09-01', 20, 1, 0, { status: 'displaced', tags: ['recall'] }),
        c('2026-09-01', 20, 1, 0, { status: 'displaced', tags: ['log'] }),
      ],
      logs: [],
    };
    expect(bandDays(period, prefs)[0]).toMatchObject({ band: null, placementMode: true });
  });
});

describe('weekShape', () => {
  const bands = (spec: (('green' | 'yellow' | 'red'))[]) =>
    spec.map((band, index) => ({
      date: `2026-09-0${index + 1}`,
      band,
      score: 0,
      template: 'full',
      placementMode: false,
      planned: true,
      anchored: true,
    }));

  it('counts the week', () => {
    const shape = weekShape(
      bands(['green', 'green', 'green', 'green', 'yellow', 'yellow', 'red']),
      prefs,
    );
    expect(shape).toMatchObject({ green: 4, yellow: 2, red: 1, targetMet: true });
  });

  it('misses the target below the green minimum', () => {
    expect(weekShape(bands(['green', 'green', 'green', 'yellow']), prefs).targetMet).toBe(false);
  });

  it('calls three yellows out by name', () => {
    const shape = weekShape(
      bands(['green', 'green', 'green', 'green', 'yellow', 'yellow', 'yellow']),
      prefs,
    );
    expect(shape.warning).toBe('Three yellows. That is the pattern that precedes collapse.');
  });

  it('warns about three yellows even in a week that met its green target', () => {
    const shape = weekShape(
      bands(['green', 'green', 'green', 'green', 'yellow', 'yellow', 'yellow']),
      withPrefs({ weekShape: { minGreen: 4, maxYellow: 3, maxRed: 1 } }),
    );
    expect(shape.targetMet).toBe(true);
    expect(shape.warning).not.toBeNull();
  });

  it('names too many red days when yellows are not the problem', () => {
    const shape = weekShape(bands(['green', 'red', 'red']), prefs);
    expect(shape.warning).toBe('2 red days against a limit of 1.');
  });

  it('reads the targets from settings', () => {
    const shape = weekShape(
      bands(['green', 'green']),
      withPrefs({ weekShape: { minGreen: 2, maxYellow: 2, maxRed: 1 } }),
    );
    expect(shape.targetMet).toBe(true);
  });
});

describe('weeklyPacing', () => {
  const target = (id: string): WeeklyTarget => {
    const found = WEEKLY_TARGETS.find((entry) => entry.id === id);
    if (!found) throw new Error(`No target ${id}`);
    return found;
  };

  it('creates urgency on a Wednesday', () => {
    // Spring Boot 6.5 of 15 hours, 3 days left -> 2.8 hrs/day. SPEC §4.3's example.
    const period: Period = {
      days: [],
      commitments: [
        c('2026-09-01', 100, 390, 390, { targetType: 'minutes', tags: ['spring'] }),
      ],
      logs: [],
    };
    const pace = weeklyPacing(period, [target('spring_hours')], 3, 10.8)[0];
    expect(pace).toMatchObject({ achieved: 6.5, requiredRate: 2.8, reachable: true });
  });

  it('stops asking for a rate once the target is met', () => {
    const period: Period = {
      days: [],
      commitments: [c('2026-09-01', 100, 900, 900, { targetType: 'minutes', tags: ['spring'] })],
      logs: [],
    };
    expect(weeklyPacing(period, [target('spring_hours')], 3, 10.8)[0]?.requiredRate).toBeNull();
  });

  it('says plainly when the week can no longer reach it', () => {
    const period: Period = { days: [], commitments: [], logs: [] };
    const pace = weeklyPacing(period, [target('spring_hours')], 1, 10.8)[0];
    expect(pace).toMatchObject({ reachable: false, shortBy: 4.2, requiredRate: 15 });
  });

  it('does not call a problem count physically impossible', () => {
    // The app has no basis for capping problems per day, so it does not pretend to.
    const period: Period = { days: [], commitments: [], logs: [] };
    expect(weeklyPacing(period, [target('dsa_new')], 1, 10.8)[0]?.reachable).toBe(true);
  });

  it('counts new problems separately from cold re-solves', () => {
    const period: Period = {
      days: [],
      commitments: [
        c('2026-09-01', 180, 4, 4, { tags: ['dsa', 'dsa_new'] }),
        c('2026-09-01', 40, 1, 1, { tags: ['dsa', 'dsa_resolve'] }),
      ],
      logs: [],
    };
    const paces = weeklyPacing(period, [target('dsa_new'), target('cold_resolve')], 3, 10.8);
    expect(paces[0]?.achieved).toBe(4);
    expect(paces[1]?.achieved).toBe(1);
  });

  it('counts recall as days completed, not as a total', () => {
    const period: Period = {
      days: [],
      commitments: [
        c('2026-09-01', 20, 1, 1, { targetType: 'binary', tags: ['recall'] }),
        c('2026-09-01', 20, 1, 1, { targetType: 'binary', tags: ['recall'] }),
        c('2026-09-02', 20, 1, 1, { targetType: 'binary', tags: ['recall'] }),
        c('2026-09-03', 20, 1, 0, { targetType: 'binary', tags: ['recall'] }),
      ],
      logs: [],
    };
    expect(weeklyPacing(period, [target('recall')], 2, 10.8)[0]?.achieved).toBe(2);
  });

  it('counts sleep from the logs', () => {
    const period: Period = {
      days: [],
      commitments: [],
      logs: [log('2026-09-01'), log('2026-09-02', { sleepHours: 6 }), log('2026-09-03')],
    };
    expect(weeklyPacing(period, [target('sleep')], 4, 10.8)[0]?.achieved).toBe(2);
  });

  it('counts gym from blocks actually contained', () => {
    const contained = (date: string, status: 'contained' | 'skipped') =>
      day(date, {
        blocks: [
          {
            blockId: 'gym', label: 'Gym', detail: null, kind: 'routine', priority: 3,
            minutes: 35, startsAt: 0, endsAt: 0, status, actualEndedAt: null,
            missedWindow: false, straddles: null, window: null,
          },
        ],
      });
    const period: Period = {
      days: [contained('2026-09-01', 'contained'), contained('2026-09-02', 'skipped')],
      commitments: [],
      logs: [],
    };
    expect(weeklyPacing(period, [target('gym')], 5, 10.8)[0]?.achieved).toBe(1);
  });

  it('marks a target the app cannot measure as untracked rather than zero', () => {
    const pace = weeklyPacing({ days: [], commitments: [], logs: [] }, [target('spring_commits')], 3, 10.8)[0];
    expect(pace).toMatchObject({ tracked: false, requiredRate: null });
  });

  it('flags below warnBelow regardless of how legitimate the displacements were', () => {
    const period: Period = {
      days: [],
      commitments: [
        c('2026-09-01', 100, 540, 540, { targetType: 'minutes', tags: ['spring'] }),
        c('2026-09-02', 100, 100, 0, {
          targetType: 'minutes', tags: ['spring'], status: 'displaced', displacedBy: 'Interview',
        }),
      ],
      logs: [],
    };
    const pace = weeklyPacing(period, [target('spring_hours')], 2, 10.8)[0];
    expect(pace).toMatchObject({ achieved: 9, belowWarn: true });
    expect(pace?.displaced).toEqual({ count: 1, reasons: ['Interview'] });
  });

  it('lists each displacement reason once', () => {
    const period: Period = {
      days: [],
      commitments: [
        c('2026-09-01', 100, 100, 0, { targetType: 'minutes', tags: ['spring'], status: 'displaced', displacedBy: 'Interview' }),
        c('2026-09-02', 100, 100, 0, { targetType: 'minutes', tags: ['spring'], status: 'displaced', displacedBy: 'Interview' }),
        c('2026-09-03', 100, 100, 0, { targetType: 'minutes', tags: ['spring'], status: 'displaced', displacedBy: 'Online assessment' }),
      ],
      logs: [],
    };
    expect(weeklyPacing(period, [target('spring_hours')], 2, 10.8)[0]?.displaced).toEqual({
      count: 3,
      reasons: ['Interview', 'Online assessment'],
    });
  });

  it('does not count displaced work toward the target', () => {
    const period: Period = {
      days: [],
      commitments: [
        c('2026-09-01', 100, 600, 600, { targetType: 'minutes', tags: ['spring'], status: 'displaced' }),
      ],
      logs: [],
    };
    // Displaced work never happened; `done` on it is not hours the user put in.
    expect(weeklyPacing(period, [target('spring_hours')], 2, 10.8)[0]?.achieved).toBe(0);
  });
});

describe('tallies', () => {
  const block = (status: 'contained' | 'overran' | 'skipped' | 'pending') => ({
    blockId: `b${seq++}`, label: 'x', detail: null, kind: 'work' as const, priority: 0 as const,
    minutes: 60, startsAt: 0, endsAt: 0, status, actualEndedAt: null,
    missedWindow: false, straddles: null, window: null,
  });

  it('reports containment across the period', () => {
    const period: Period = {
      days: [
        day('2026-09-01', { blocks: [block('contained'), block('overran')] }),
        day('2026-09-02', { blocks: [block('contained'), block('skipped'), block('pending')] }),
      ],
      commitments: [],
      logs: [],
    };
    expect(tallies(period).containedPercent).toBe(50);
  });

  it('counts pushes, avoidance and displacement', () => {
    const period: Period = {
      days: [day('2026-09-01', { pushes: [{ at: 0, minutes: 30 }, { at: 1, minutes: 15 }] })],
      commitments: [
        c('2026-09-01', 90, 1, 0, { status: 'avoided' }),
        c('2026-09-01', 90, 1, 0, { status: 'displaced' }),
      ],
      logs: [],
    };
    expect(tallies(period)).toMatchObject({ pushes: 2, avoided: 1, displaced: 1 });
  });

  it('gives an energy trend in date order', () => {
    const period: Period = {
      days: [],
      commitments: [],
      logs: [log('2026-09-03', { energy: 5 }), log('2026-09-01', { energy: 2 }), log('2026-09-02', { energy: 3 })],
    };
    expect(tallies(period).energyTrend).toEqual([2, 3, 5]);
    expect(tallies(period).energy).toBe(3.3);
  });

  it('has no containment percentage with nothing resolved', () => {
    expect(tallies({ days: [], commitments: [], logs: [] }).containedPercent).toBeNull();
  });
});

describe('tagTotals', () => {
  it('totals earned minutes per tag, largest first', () => {
    const period: Period = {
      days: [],
      commitments: [
        c('2026-09-01', 180, 4, 2, { tags: ['dsa'] }),
        c('2026-09-01', 100, 100, 100, { tags: ['spring'] }),
        c('2026-09-02', 20, 1, 1, { tags: ['recall'] }),
      ],
      logs: [],
    };
    expect(tagTotals(period)).toEqual([
      { tag: 'spring', minutes: 100, done: 100 },
      { tag: 'dsa', minutes: 90, done: 2 },
      { tag: 'recall', minutes: 20, done: 1 },
    ]);
  });

  it('leaves displaced work out entirely', () => {
    const period: Period = {
      days: [],
      commitments: [c('2026-09-01', 180, 4, 4, { tags: ['dsa'], status: 'displaced' })],
      logs: [],
    };
    expect(tagTotals(period)).toEqual([]);
  });
});

describe('milestoneStatuses', () => {
  const milestones: Milestone[] = [
    { date: '2026-09-10', label: 'Near', checklist: ['a', 'b'] },
    { date: '2026-10-30', label: 'Far', critical: true },
    { date: '2026-08-20', label: 'Past' },
  ];
  const view = (progress: Map<string, { checked: string[]; doneAt: number | null }>, asOf: string) =>
    Object.fromEntries(
      milestoneStatuses(milestones, progress, asOf).map((entry) => [entry.label, entry]),
    );

  it('counts days remaining', () => {
    expect(view(new Map(), '2026-09-01')['Near']?.daysRemaining).toBe(9);
    expect(view(new Map(), '2026-09-01')['Past']?.daysRemaining).toBe(-12);
  });

  it('is upcoming while it is more than a week out', () => {
    expect(view(new Map(), '2026-09-01')['Near']?.status).toBe('upcoming');
  });

  it('is at risk within seven days with the work not started', () => {
    expect(view(new Map(), '2026-09-04')['Near']?.status).toBe('atRisk');
  });

  it('is not at risk once the work has started', () => {
    const progress = new Map([['2026-09-10|Near', { checked: ['a'], doneAt: null }]]);
    expect(view(progress, '2026-09-04')['Near']?.status).toBe('upcoming');
  });

  it('is done once every checklist item is ticked', () => {
    const progress = new Map([['2026-09-10|Near', { checked: ['a', 'b'], doneAt: null }]]);
    expect(view(progress, '2026-09-04')['Near']?.status).toBe('done');
  });

  it('is done when marked done, checklist or not', () => {
    const progress = new Map([['2026-10-30|Far', { checked: [], doneAt: 1 }]]);
    expect(view(progress, '2026-09-01')['Far']?.status).toBe('done');
  });

  it('is missed once the date has gone and it is not done', () => {
    expect(view(new Map(), '2026-09-01')['Past']?.status).toBe('missed');
  });

  it('is not missed if it was done before the date passed', () => {
    const progress = new Map([['2026-08-20|Past', { checked: [], doneAt: 1 }]]);
    expect(view(progress, '2026-09-01')['Past']?.status).toBe('done');
  });

  it('carries the critical flag through', () => {
    expect(view(new Map(), '2026-09-01')['Far']?.critical).toBe(true);
  });
});

describe('weeklyPacing — rate phrasing', () => {
  const target = (id: string): WeeklyTarget => {
    const found = WEEKLY_TARGETS.find((entry) => entry.id === id);
    if (!found) throw new Error(`No target ${id}`);
    return found;
  };
  const empty: Period = { days: [], commitments: [], logs: [] };

  it('offers a per-day rate for hours and problems', () => {
    expect(weeklyPacing(empty, [target('spring_hours')], 3, 10.8)[0]?.ratePerDay).toBe(true);
    expect(weeklyPacing(empty, [target('dsa_new')], 3, 10.8)[0]?.ratePerDay).toBe(true);
  });

  it('does not, for a target whose unit is already a count of days', () => {
    // "Need 0.3 days per day" is not a sentence worth printing.
    for (const id of ['recall', 'sleep', 'gym']) {
      expect(weeklyPacing(empty, [target(id)], 3, 10.8)[0]?.ratePerDay).toBe(false);
    }
  });

  it('reports the plain shortfall alongside the rate', () => {
    const pace = weeklyPacing(empty, [target('recall')], 3, 10.8)[0];
    expect(pace).toMatchObject({ shortfall: 5, achieved: 0 });
  });
});
