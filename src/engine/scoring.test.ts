import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../config/schedule.config';
import type { Prefs } from '../lib/prefs';
import {
  burnDown,
  completionOf,
  projectDay,
  scoreDay,
  statusForProgress,
  triageOrder,
  type Scorable,
} from './scoring';

const prefs: Prefs = DEFAULT_PREFS;
const withPrefs = (over: Partial<Prefs>): Prefs => ({ ...prefs, ...over });

/** Terse builder — every test states the numbers it depends on. */
const c = (
  blockId: string,
  plannedMinutes: number,
  target: number,
  done: number,
  over: Partial<Scorable> = {},
): Scorable => ({
  blockId,
  plannedMinutes,
  target,
  done,
  status: 'open',
  tags: [],
  ...over,
});

describe('completionOf', () => {
  it('gives partial credit', () => {
    expect(completionOf(c('dsa_deep', 180, 4, 2))).toBe(0.5);
    expect(completionOf(c('spring_1', 100, 90, 60))).toBeCloseTo(0.667, 3);
  });

  it('clamps above one — four problems out of a target of two is not 200%', () => {
    expect(completionOf(c('dsa_deep', 180, 2, 4))).toBe(1);
  });

  it('scores a skipped commitment zero whatever was logged against it', () => {
    expect(completionOf(c('dsa_deep', 180, 4, 3, { status: 'skipped' }))).toBe(0);
    expect(completionOf(c('dsa_deep', 180, 4, 3, { status: 'avoided' }))).toBe(0);
  });
});

describe('scoreDay — weighting is planned minutes', () => {
  it('counts a 3-hour block nine times a 20-minute task', () => {
    // 180 done, 20 not: 180 / 200 = 90%.
    const result = scoreDay(
      [
        c('dsa_deep', 180, 1, 1, { tags: ['dsa'] }),
        c('recall', 20, 1, 0, { tags: ['recall'] }),
      ],
      withPrefs({ nonNegotiableGate: false }),
      true,
    );
    expect(result.weight).toBe(200);
    expect(result.earned).toBe(180);
    expect(result.score).toBe(90);
  });

  it('scores a full day at 100', () => {
    const result = scoreDay(
      [
        c('recall', 20, 1, 1, { tags: ['recall'] }),
        c('dsa_deep', 180, 4, 4, { tags: ['dsa'] }),
        c('log', 20, 1, 1, { tags: ['log'] }),
      ],
      prefs,
      true,
    );
    expect(result.score).toBe(100);
    expect(result.band).toBe('green');
    expect(result.gatePassed).toBe(true);
  });

  it('blends partial credit by weight', () => {
    // 180×0.5 + 100×1 + 20×0 = 190 over 300 = 63.3 -> 63.
    const result = scoreDay(
      [
        c('dsa_deep', 180, 4, 2),
        c('spring_1', 100, 100, 100),
        c('recall', 20, 1, 0),
      ],
      withPrefs({ nonNegotiableGate: false }),
      true,
    );
    expect(result.earned).toBe(190);
    expect(result.weight).toBe(300);
    expect(result.score).toBe(63);
  });
});

describe('scoreDay — displacement leaves both sides of the ratio', () => {
  const commitments = [
    c('recall', 20, 1, 1, { tags: ['recall'] }),
    c('log', 20, 1, 1, { tags: ['log'] }),
    c('dsa_deep', 180, 4, 4, { tags: ['dsa'] }),
    c('spring_1', 100, 100, 0, { tags: ['spring'], status: 'displaced' }),
  ];

  it('removes the displaced commitment from numerator and denominator', () => {
    const result = scoreDay(commitments, prefs, true);
    expect(result.weight).toBe(220);
    expect(result.earned).toBe(220);
    expect(result.score).toBe(100);
    expect(result.displaced).toBe(1);
  });

  it('scores the day on what remained, not on what was lost', () => {
    // Without the displacement rule this would be 220/320 = 69 and yellow.
    expect(scoreDay(commitments, prefs, true).band).toBe('green');
  });

  it('keeps a skip in the denominator at zero', () => {
    const skipped = [
      c('recall', 20, 1, 1, { tags: ['recall'] }),
      c('log', 20, 1, 1, { tags: ['log'] }),
      c('dsa_deep', 180, 4, 4, { tags: ['dsa'] }),
      c('spring_1', 100, 100, 0, { tags: ['spring'], status: 'skipped' }),
    ];
    const result = scoreDay(skipped, prefs, true);
    expect(result.weight).toBe(320);
    expect(result.earned).toBe(220);
    expect(result.score).toBe(69);
  });

  it('treats avoided exactly as skipped for scoring', () => {
    const asSkipped = scoreDay(
      [c('flex', 90, 1, 0, { status: 'skipped' }), c('dsa_deep', 180, 1, 1)],
      withPrefs({ nonNegotiableGate: false }),
      true,
    );
    const asAvoided = scoreDay(
      [c('flex', 90, 1, 0, { status: 'avoided' }), c('dsa_deep', 180, 1, 1)],
      withPrefs({ nonNegotiableGate: false }),
      true,
    );
    expect(asAvoided.score).toBe(asSkipped.score);
  });
});

describe('scoreDay — the gate', () => {
  // SPEC §4.1's worked example: a high percentage that must not be green.
  const missedRecall = [
    c('recall', 20, 1, 0, { tags: ['recall'] }),
    c('log', 20, 1, 1, { tags: ['log'] }),
    c('dsa_deep', 180, 4, 4, { tags: ['dsa'] }),
    c('spring_1', 180, 180, 180, { tags: ['spring'] }),
  ];

  it('holds a 95% day at yellow when a non-negotiable was missed', () => {
    const result = scoreDay(missedRecall, prefs, true);
    expect(result.score).toBe(95);
    expect(result.gatePassed).toBe(false);
    expect(result.failedGates).toEqual(['recall']);
    expect(result.band).toBe('yellow');
  });

  it('does not inflate the weight to do it — the percentage is untouched', () => {
    // The gate changes the band, never the arithmetic.
    const gateOff = scoreDay(missedRecall, withPrefs({ nonNegotiableGate: false }), true);
    expect(gateOff.score).toBe(95);
    expect(gateOff.band).toBe('green');
  });

  it('reports every non-negotiable that failed, in settings order', () => {
    const result = scoreDay(
      [
        c('recall', 20, 1, 0, { tags: ['recall'] }),
        c('log', 20, 1, 0, { tags: ['log'] }),
        c('dsa_deep', 180, 4, 4, { tags: ['dsa'] }),
      ],
      prefs,
      true,
    );
    expect(result.failedGates).toEqual(['recall', 'log']);
  });

  it('matches a non-negotiable by block id as well as by tag', () => {
    const byBlockId = scoreDay(
      [c('recall', 20, 1, 0), c('dsa_deep', 180, 1, 1)],
      withPrefs({ nonNegotiables: ['recall'] }),
      true,
    );
    expect(byBlockId.failedGates).toEqual(['recall']);
  });

  it('fails a non-negotiable that was never planned', () => {
    // Not planning the recall drill is not a way to avoid missing it.
    const result = scoreDay([c('dsa_deep', 180, 4, 4, { tags: ['dsa'] })], prefs, true);
    expect(result.failedGates).toEqual(['recall', 'log']);
    expect(result.band).toBe('yellow');
  });

  it('excuses a non-negotiable that was displaced', () => {
    const result = scoreDay(
      [
        c('recall', 20, 1, 0, { tags: ['recall'], status: 'displaced' }),
        c('log', 20, 1, 1, { tags: ['log'] }),
        c('dsa_deep', 180, 4, 4, { tags: ['dsa'] }),
      ],
      prefs,
      true,
    );
    expect(result.gatePassed).toBe(true);
    expect(result.band).toBe('green');
  });

  it('reads the list from settings, not from config', () => {
    const result = scoreDay(
      [c('gym', 35, 1, 0, { tags: ['gym'] }), c('dsa_deep', 180, 1, 1)],
      withPrefs({ nonNegotiables: ['gym'] }),
      true,
    );
    expect(result.failedGates).toEqual(['gym']);
  });
});

describe('scoreDay — bands', () => {
  const at = (score: number, over: Partial<Prefs> = {}) => {
    // One commitment weighted 100, done to `score`, so the ratio is the score.
    const result = scoreDay(
      [c('flex', 100, 100, score)],
      withPrefs({ nonNegotiableGate: false, ...over }),
      true,
    );
    return result.band;
  };

  it('is green at and above the green threshold', () => {
    expect(at(80)).toBe('green');
    expect(at(100)).toBe('green');
  });

  it('is yellow between the thresholds', () => {
    expect(at(79)).toBe('yellow');
    expect(at(55)).toBe('yellow');
  });

  it('is red below the yellow threshold', () => {
    expect(at(54)).toBe('red');
    expect(at(0)).toBe('red');
  });

  it('reads both thresholds from settings', () => {
    expect(at(79, { greenThreshold: 75 })).toBe('green');
    expect(at(54, { yellowThreshold: 50 })).toBe('yellow');
  });

  it('is red for an unplanned day regardless of what got done', () => {
    const result = scoreDay(
      [
        c('recall', 20, 1, 1, { tags: ['recall'] }),
        c('log', 20, 1, 1, { tags: ['log'] }),
        c('dsa_deep', 180, 4, 4, { tags: ['dsa'] }),
      ],
      prefs,
      false,
    );
    expect(result.band).toBe('red');
    expect(result.score).toBeNull();
  });

  it('has no score at all when every commitment was displaced', () => {
    // A day spent in an interview is not a lapse in discipline — SPEC §4.6.
    const result = scoreDay(
      [
        c('dsa_deep', 180, 4, 0, { status: 'displaced' }),
        c('spring_1', 100, 100, 0, { status: 'displaced' }),
      ],
      withPrefs({ nonNegotiableGate: false }),
      true,
    );
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
    expect(result.displaced).toBe(2);
  });
});

describe('projectDay — the live projected score', () => {
  const commitments = [
    c('recall', 20, 1, 1, { tags: ['recall'] }),
    c('dsa_deep', 180, 4, 1, { tags: ['dsa'] }),
    c('spring_1', 100, 100, 0, { tags: ['spring'] }),
    c('log', 20, 1, 0, { tags: ['log'] }),
  ];

  it('reads 100 on an untouched day — nothing has been lost yet', () => {
    const untouched = commitments.map((commitment) => ({ ...commitment, done: 0 }));
    expect(projectDay(untouched, prefs, true, () => false).score).toBe(100);
  });

  it('drops the moment a block passes with its commitment unfinished', () => {
    // dsa_deep gone at 1 of 4: 20 + 180×0.25 + 100 + 20 = 185 of 320 = 57.8 -> 58.
    const passed = (blockId: string | null): boolean => blockId === 'dsa_deep';
    expect(projectDay(commitments, prefs, true, passed).score).toBe(58);
  });

  it('credits work still ahead of you', () => {
    // Only recall has passed, and it is done: everything else is still winnable.
    const passed = (blockId: string | null): boolean => blockId === 'recall';
    expect(projectDay(commitments, prefs, true, passed).score).toBe(100);
  });

  it('never credits a dropped commitment', () => {
    const dropped = [
      c('dsa_deep', 180, 4, 0, { status: 'skipped' }),
      c('spring_1', 100, 100, 0),
    ];
    // 0 + 100 of 280 = 35.7 -> 36.
    expect(projectDay(dropped, withPrefs({ nonNegotiableGate: false }), true, () => false).score)
      .toBe(36);
  });

  it('settles on the real score once every block has passed', () => {
    const passed = (): boolean => true;
    expect(projectDay(commitments, prefs, true, passed)).toEqual(
      scoreDay(commitments, prefs, true),
    );
  });
});

describe('burnDown', () => {
  const commitments = [
    c('dsa_deep', 180, 4, 2),
    c('spring_1', 100, 100, 0),
    c('log', 20, 1, 1),
  ];

  it('owes only what is left, discounted by partial credit', () => {
    // 180×0.5 + 100×1 + 20×0 = 190.
    expect(burnDown(commitments, 300).committedMinutes).toBe(190);
  });

  it('is not negative while the work still fits', () => {
    const result = burnDown(commitments, 300);
    expect(result.negative).toBe(false);
    expect(result.overBy).toBe(0);
  });

  it('goes negative with the gap when commitment exceeds the runway', () => {
    const result = burnDown(commitments, 125);
    expect(result.negative).toBe(true);
    expect(result.overBy).toBe(65);
  });

  it('owes nothing for a dropped commitment', () => {
    const dropped = [
      c('dsa_deep', 180, 4, 0, { status: 'displaced' }),
      c('spring_1', 100, 100, 0, { status: 'skipped' }),
      c('log', 20, 1, 0),
    ];
    expect(burnDown(dropped, 300).committedMinutes).toBe(20);
  });
});

describe('triageOrder', () => {
  const priority = (blockId: string | null): number =>
    ({ dsa_deep: 0, spring_1: 0, core_cse: 1, flex: 2, dsa_second: 2 })[blockId ?? ''] ?? 3;

  it('offers what the day can most afford to lose first', () => {
    const order = triageOrder(
      [
        c('dsa_deep', 180, 4, 0),
        c('flex', 90, 1, 0),
        c('core_cse', 120, 120, 0),
        c('dsa_second', 40, 1, 0),
      ],
      priority,
    ).map((commitment) => commitment.blockId);

    expect(order).toEqual(['flex', 'dsa_second', 'core_cse', 'dsa_deep']);
  });

  it('breaks a priority tie by size, largest first', () => {
    const order = triageOrder([c('dsa_second', 40, 1, 0), c('flex', 90, 1, 0)], priority);
    expect(order.map((commitment) => commitment.blockId)).toEqual(['flex', 'dsa_second']);
  });

  it('never offers a finished or already-dropped commitment', () => {
    const order = triageOrder(
      [
        c('flex', 90, 1, 1),
        c('dsa_second', 40, 1, 0, { status: 'displaced' }),
        c('core_cse', 120, 120, 30),
      ],
      priority,
    );
    expect(order.map((commitment) => commitment.blockId)).toEqual(['core_cse']);
  });

  it('does not mutate the array it is given', () => {
    const input = [c('dsa_deep', 180, 4, 0), c('flex', 90, 1, 0)];
    const snapshot = JSON.parse(JSON.stringify(input));
    triageOrder(input, priority);
    expect(input).toEqual(snapshot);
  });
});

describe('statusForProgress', () => {
  it('derives open, partial and complete from progress', () => {
    expect(statusForProgress(c('dsa_deep', 180, 4, 0))).toBe('open');
    expect(statusForProgress(c('dsa_deep', 180, 4, 2))).toBe('partial');
    expect(statusForProgress(c('dsa_deep', 180, 4, 4))).toBe('complete');
  });

  it('never overwrites an explicit drop', () => {
    for (const status of ['skipped', 'avoided', 'displaced'] as const) {
      expect(statusForProgress(c('dsa_deep', 180, 4, 4, { status }))).toBe(status);
    }
  });
});

describe('projectDay — capped by the day that is left', () => {
  const commitments = [
    c('recall', 20, 1, 1, { tags: ['recall'] }),
    c('dsa_deep', 180, 4, 0, { tags: ['dsa'] }),
    c('spring_1', 100, 100, 0, { tags: ['spring'] }),
    c('log', 20, 1, 0, { tags: ['log'] }),
  ];
  const nothingPassed = (): boolean => false;

  it('still reads 100 when the day has room for everything', () => {
    expect(projectDay(commitments, prefs, true, nothingPassed, 400).score).toBe(100);
  });

  it('cannot claim more than the runway holds', () => {
    // 300 minutes owed, 150 left: recall is done, dsa gets 150 of its 180.
    // 20 + 150 + 0 + 0 = 170 of 320 = 53.
    const result = projectDay(commitments, prefs, true, nothingPassed, 150);
    expect(result.score).toBe(53);
  });

  it('gives the same total whatever the order — weight is minutes', () => {
    // Distributing a fixed runway across minute-weighted commitments always earns the
    // same total. Order cannot flatter the percentage, which is the point.
    const reversed = [...commitments].reverse();
    expect(projectDay(reversed, prefs, true, nothingPassed, 150).score).toBe(
      projectDay(commitments, prefs, true, nothingPassed, 150).score,
    );
  });

  it('but does change which commitments are reachable', () => {
    // Chronologically the log is last and does not fit, so the gate fails on it.
    expect(projectDay(commitments, prefs, true, nothingPassed, 150).failedGates).toEqual(['log']);
    // Put it first and the runway reaches it.
    const logFirst = [...commitments].reverse();
    expect(projectDay(logFirst, prefs, true, nothingPassed, 150).failedGates).toEqual([]);
  });

  it('credits nothing extra with no day left', () => {
    // Only what is already done: recall's 20 of 320 = 6.
    expect(projectDay(commitments, prefs, true, nothingPassed, 0).score).toBe(6);
  });

  it('is unchanged when no runway is given', () => {
    expect(projectDay(commitments, prefs, true, nothingPassed).score).toBe(100);
  });

  it('never contradicts the burn-down', () => {
    // Whenever burn-down says over-committed, the projection must be under 100.
    const burn = burnDown(commitments, 150);
    expect(burn.negative).toBe(true);
    expect(projectDay(commitments, prefs, true, nothingPassed, 150).score).toBeLessThan(100);
  });
});
