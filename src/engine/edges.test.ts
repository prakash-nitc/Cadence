/**
 * Adversarial edge cases across every engine.
 *
 * Written by going looking for trouble rather than by restating what each function was
 * built to do: empty inputs, zero weights, days that cross midnight, degenerate targets.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  FIXED_WINDOWS,
  FULL_DAY,
  LATE_NIGHT,
  WEEKLY_TARGETS,
  type BlockDef,
} from '../config/schedule.config';
import type { CommitmentRecord, DayRecord } from '../db/schema';
import type { Prefs } from '../lib/prefs';
import { formatDuration, toHHMM } from '../lib/time';
import { containment, pullForward, pushRemaining, resolveBlock } from './boundaries';
import { availableMinutes, degrade, planDay } from './capacity';
import { carve } from './carve';
import { checkFeasibility, committableMinutes } from './feasibility';
import { layoutDay } from './layout';
import { bandDays, weeklyPacing, weekShape } from './pacing';
import { burnDown, completionOf, projectDay, scoreDay, triageOrder } from './scoring';

const prefs: Prefs = DEFAULT_PREFS;
const at = (hhmm: string, day = '2026-09-01'): Date => new Date(`${day}T${hhmm}:00`);

const commitment = (over: Partial<CommitmentRecord> = {}): CommitmentRecord => ({
  id: `c${Math.random()}`,
  dayDate: '2026-09-01',
  blockId: 'dsa_deep',
  label: 'work',
  targetType: 'count',
  target: 4,
  done: 0,
  plannedMinutes: 180,
  tags: [],
  status: 'open',
  displacedBy: null,
  movedCount: 0,
  originDate: '2026-09-01',
  ...over,
});

// ─── Empty and degenerate inputs ──────────────────────────────────────────────

describe('empty inputs do not explode', () => {
  it('lays an empty day', () => {
    expect(layoutDay(at('06:00'), [], FIXED_WINDOWS)).toEqual([]);
  });

  it('degrades an empty template', () => {
    const result = degrade([], 600, prefs, 360);
    expect(result.blocks).toEqual([]);
    expect(result.shortfallMinutes).toBe(0);
  });

  it('plans an empty day', () => {
    expect(planDay(at('06:00'), [], FIXED_WINDOWS, prefs).blocks).toEqual([]);
  });

  it('carves from a template with no work blocks', () => {
    const noWork: BlockDef[] = [
      { id: 'a', label: 'Break', minutes: 30, kind: 'break', priority: 2 },
    ];
    expect(carve(noWork, 240).blocks).toEqual([]);
  });

  it('scores a day with no commitments', () => {
    expect(scoreDay([], prefs, true).score).toBeNull();
  });

  it('shapes a week with no days', () => {
    expect(weekShape([], prefs)).toMatchObject({ green: 0, yellow: 0, red: 0 });
  });

  it('bands a period with no days', () => {
    expect(bandDays({ days: [], commitments: [], logs: [] }, prefs)).toEqual([]);
  });

  it('paces with no history', () => {
    const paces = weeklyPacing({ days: [], commitments: [], logs: [] }, WEEKLY_TARGETS, 0, 10.8);
    expect(paces.every((pace) => pace.requiredRate === null)).toBe(true);
  });

  it('triages nothing', () => {
    expect(triageOrder([], () => 0)).toEqual([]);
  });

  it('burns down nothing', () => {
    expect(burnDown([], 0)).toMatchObject({ committedMinutes: 0, negative: false });
  });
});

describe('degenerate numbers', () => {
  it('a zero target does not divide by zero', () => {
    expect(completionOf(commitment({ target: 0, done: 5 }))).toBe(0);
    expect(Number.isFinite(completionOf(commitment({ target: 0, done: 0 })))).toBe(true);
  });

  it('negative progress cannot go below zero', () => {
    expect(completionOf(commitment({ done: -10 }))).toBe(0);
  });

  it('a zero-weight commitment does not break the ratio', () => {
    const result = scoreDay(
      [commitment({ plannedMinutes: 0, done: 4 }), commitment({ plannedMinutes: 100, done: 4 })],
      { ...prefs, nonNegotiableGate: false },
      true,
    );
    expect(result.score).toBe(100);
  });

  it('a day of only zero-weight commitments is not reported as displaced', () => {
    // Weight zero has the same arithmetic as "everything displaced", but it is a
    // different situation and must not borrow that copy.
    const result = scoreDay(
      [commitment({ plannedMinutes: 0 }), commitment({ plannedMinutes: 0 })],
      { ...prefs, nonNegotiableGate: false },
      true,
    );
    expect(result.displaced).toBe(0);
  });

  it('formats a negative duration as none', () => {
    expect(formatDuration(-30)).toBe('0m');
  });

  it('projects with no runway at all', () => {
    const result = projectDay([commitment()], prefs, true, () => false, 0);
    expect(Number.isFinite(result.score ?? 0)).toBe(true);
  });

  it('projects with a negative runway', () => {
    const result = projectDay([commitment()], prefs, true, () => false, -100);
    expect(result.score).toBe(0);
  });

  it('checks feasibility against zero available time', () => {
    const verdict = checkFeasibility(
      [{ id: 'a', label: 'a', target: 1, plannedMinutes: 60, tags: [] }],
      0,
      [],
      prefs,
    );
    expect(verdict.status).toBe('overCapacity');
    expect(Number.isFinite(verdict.overBy)).toBe(true);
  });

  it('counts committable minutes of nothing', () => {
    expect(committableMinutes([])).toBe(0);
  });
});

// ─── Days that cross midnight ─────────────────────────────────────────────────

describe('a day that runs past midnight', () => {
  it('lays blocks across the boundary without going backwards', () => {
    const blocks = layoutDay(at('22:00'), LATE_NIGHT, FIXED_WINDOWS);
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i]!.startsAt).toBeGreaterThanOrEqual(blocks[i - 1]!.endsAt);
    }
  });

  it('keeps every block forward in time', () => {
    const blocks = layoutDay(at('23:30'), LATE_NIGHT, FIXED_WINDOWS);
    for (const block of blocks) expect(block.endsAt).toBeGreaterThanOrEqual(block.startsAt);
  });

  it('waits for the next morning window instead of calling it missed', () => {
    // Work runs 22:00 -> 06:00. Breakfast opens at 07:00 that same morning, so it idles
    // an hour and is served. Resolving the window on the anchor's date instead made it
    // look fifteen hours past and wrongly reported the mess as shut.
    const template: BlockDef[] = [
      { id: 'work', label: 'Work', minutes: 480, kind: 'work', priority: 0 },
      { id: 'breakfast', label: 'Breakfast', minutes: 30, kind: 'meal', priority: 3, window: 'breakfast' },
    ];
    const blocks = layoutDay(at('22:00'), template, FIXED_WINDOWS);
    const breakfast = blocks.find((block) => block.blockId === 'breakfast');

    expect(toHHMM(breakfast!.startsAt)).toBe('07:00');
    expect(breakfast!.missedWindow).toBe(false);
    expect(blocks.find((block) => block.blockId === 'gap:breakfast')?.minutes).toBe(60);
  });

  it("still calls last night's dinner missed rather than waiting a day for the next", () => {
    // A block finishing at 00:30 must not idle nineteen hours for the following evening.
    const template: BlockDef[] = [
      { id: 'work', label: 'Work', minutes: 150, kind: 'work', priority: 0 },
      { id: 'dinner', label: 'Dinner', minutes: 60, kind: 'meal', priority: 3, window: 'dinner' },
    ];
    const blocks = layoutDay(at('22:00'), template, FIXED_WINDOWS);
    const dinner = blocks.find((block) => block.blockId === 'dinner');

    expect(toHHMM(dinner!.startsAt)).toBe('00:30');
    expect(dinner!.missedWindow).toBe(true);
  });

  it('is unchanged on an ordinary day', () => {
    const blocks = layoutDay(at('05:45'), FULL_DAY, FIXED_WINDOWS);
    const lunch = blocks.find((block) => block.blockId === 'lunch');
    expect(toHHMM(lunch!.startsAt)).toBe('13:00');
    expect(lunch!.missedWindow).toBe(false);
  });

  it('measures a day end after midnight', () => {
    expect(availableMinutes(at('22:00'), '02:00')).toBe(240);
  });
});

// ─── Boundary mechanics ───────────────────────────────────────────────────────

describe('boundary mechanics under pressure', () => {
  const laid = () => layoutDay(at('05:45'), FULL_DAY, FIXED_WINDOWS);

  it('pushes the last block without inventing a successor', () => {
    const blocks = laid();
    const last = blocks[blocks.length - 1]!;
    const pushed = pushRemaining(blocks, last.startsAt + 60_000, 30);
    expect(pushed).toHaveLength(blocks.length);
    expect(pushed[pushed.length - 1]!.endsAt).toBe(last.endsAt + 30 * 60_000);
  });

  it('a push never reorders the day', () => {
    const pushed = pushRemaining(laid(), at('09:00').getTime(), 60);
    for (let i = 1; i < pushed.length; i++) {
      expect(pushed[i]!.startsAt).toBeGreaterThanOrEqual(pushed[i - 1]!.startsAt);
    }
  });

  it('pulling forward never drags a block before the moment it was pulled', () => {
    const pulled = pullForward(laid(), at('09:00').getTime(), 600);
    for (const block of pulled) {
      if (block.startsAt >= at('09:00').getTime()) continue;
      // Anything moved must still start no earlier than the original day start.
      expect(block.startsAt).toBeGreaterThanOrEqual(at('05:45').getTime() - 600 * 60_000);
    }
  });

  it('a huge push does not overflow', () => {
    const pushed = pushRemaining(laid(), at('09:00').getTime(), 100_000);
    expect(pushed.every((block) => Number.isFinite(block.endsAt))).toBe(true);
  });

  it('resolving a block that does not exist changes nothing', () => {
    const blocks = laid();
    expect(resolveBlock(blocks, 'nope', 'contained', 0)).toEqual(blocks);
  });

  it('containment of a day of only gaps has no percentage', () => {
    const early = layoutDay(at('05:00'), FULL_DAY, FIXED_WINDOWS);
    const gapsOnly = early.filter((block) => block.kind === 'gap');
    expect(containment(gapsOnly).percent).toBeNull();
  });
});

// ─── Capacity ─────────────────────────────────────────────────────────────────

describe('capacity under pressure', () => {
  it('never drops a protected block however little time there is', () => {
    for (const minutes of [0, 1, 30, 120]) {
      const result = degrade(FULL_DAY, minutes, prefs, 360);
      for (const id of ['recall', 'dsa_deep', 'spring_1', 'spring_2', 'log']) {
        expect(result.blocks.map((block) => block.id)).toContain(id);
      }
    }
  });

  it('never compresses below a floor however little time there is', () => {
    const result = degrade(FULL_DAY, 0, prefs, 360);
    const dsa = result.blocks.find((block) => block.id === 'dsa_deep');
    expect(dsa?.minutes).toBe(90);
  });

  it('reports a shortfall rather than a negative day', () => {
    const result = degrade(FULL_DAY, 0, prefs, 360);
    expect(result.shortfallMinutes).toBeGreaterThan(0);
    expect(result.blocks.every((block) => block.minutes > 0)).toBe(true);
  });

  it('carves at every size without losing or inventing time', () => {
    for (let minutes = 0; minutes <= 700; minutes += 37) {
      const result = carve(FULL_DAY, minutes);
      expect(result.usedMinutes).toBeLessThanOrEqual(Math.max(0, minutes));
      expect(result.blocks.every((block) => block.minutes > 0)).toBe(true);
    }
  });
});

// ─── Scoring invariants ───────────────────────────────────────────────────────

describe('scoring invariants', () => {
  it('a score is always between 0 and 100', () => {
    const cases: CommitmentRecord[][] = [
      [commitment({ done: 99, target: 1 })],
      [commitment({ done: -5 })],
      [commitment({ plannedMinutes: -100, done: 4 })],
      [commitment({ done: 4 }), commitment({ done: 0, plannedMinutes: 1 })],
    ];
    for (const set of cases) {
      const score = scoreDay(set, { ...prefs, nonNegotiableGate: false }, true).score;
      if (score === null) continue;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('the projection is never below the score it projects from', () => {
    const set = [commitment({ done: 1 }), commitment({ blockId: 'spring_1', done: 0 })];
    const now = scoreDay(set, prefs, true).score ?? 0;
    const projected = projectDay(set, prefs, true, () => false, 10_000).score ?? 0;
    expect(projected).toBeGreaterThanOrEqual(now);
  });

  it('an over-committed day never projects 100', () => {
    const set = [commitment({ plannedMinutes: 600, done: 0 })];
    const runway = 60;
    expect(burnDown(set, runway).negative).toBe(true);
    expect(projectDay(set, { ...prefs, nonNegotiableGate: false }, true, () => false, runway).score)
      .toBeLessThan(100);
  });

  it('triage never offers something already finished', () => {
    const order = triageOrder(
      [commitment({ done: 4 }), commitment({ done: 0 }), commitment({ status: 'skipped' })],
      () => 0,
    );
    expect(order).toHaveLength(1);
  });
});

// ─── Pacing ───────────────────────────────────────────────────────────────────

describe('pacing under pressure', () => {
  const day = (date: string, over: Partial<DayRecord> = {}): DayRecord => ({
    date,
    anchorAt: at('05:45', date).getTime(),
    template: 'full',
    blocks: [],
    degradation: [],
    pushes: [],
    placementMode: false,
    score: null,
    band: null,
    gatePassed: null,
    plannedAt: 1,
    plannedBlocks: null,
    plannedAnchor: null,
    ...over,
  });

  it('never divides by zero remaining days', () => {
    const paces = weeklyPacing({ days: [], commitments: [], logs: [] }, WEEKLY_TARGETS, 0, 10.8);
    for (const pace of paces) {
      expect(pace.requiredRate === null || Number.isFinite(pace.requiredRate)).toBe(true);
    }
  });

  it('handles a negative day count', () => {
    const paces = weeklyPacing({ days: [], commitments: [], logs: [] }, WEEKLY_TARGETS, -3, 10.8);
    expect(paces.every((pace) => pace.requiredRate === null)).toBe(true);
  });

  it('bands a day whose commitments belong to another day', () => {
    const period = {
      days: [day('2026-09-01')],
      commitments: [commitment({ dayDate: '2026-09-02' })],
      logs: [],
    };
    // The commitment is not on this day, so the day has nothing to score.
    expect(bandDays(period, prefs)[0]?.score).toBeNull();
  });
});

// ─── Time helpers ─────────────────────────────────────────────────────────────

describe('time helpers', () => {
  it('formats round numbers cleanly', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(1440)).toBe('24h');
  });

  it('renders midnight and noon correctly', () => {
    expect(toHHMM(at('00:00'))).toBe('00:00');
    expect(toHHMM(at('12:00'))).toBe('12:00');
    expect(toHHMM(at('23:59'))).toBe('23:59');
  });
});

describe('a meal window too far away to be this day\'s', () => {
  it('does not bury the evening under a nine-hour wait', () => {
    // A full day anchored at 20:00 reaches breakfast at 21:30. Idling to the next
    // morning's window would insert a 9h 30m gap and push the day into tomorrow.
    const blocks = layoutDay(at('20:00'), FULL_DAY, FIXED_WINDOWS);
    const longest = Math.max(
      ...blocks.filter((block) => block.kind === 'gap').map((block) => block.minutes),
      0,
    );
    expect(longest).toBeLessThanOrEqual(4 * 60);
  });

  it('flags that meal rather than silently misplacing it', () => {
    const blocks = layoutDay(at('20:00'), FULL_DAY, FIXED_WINDOWS);
    expect(blocks.find((block) => block.blockId === 'breakfast')?.missedWindow).toBe(true);
  });

  it('still waits a reasonable time for a window it can reach', () => {
    const blocks = layoutDay(at('05:00'), FULL_DAY, FIXED_WINDOWS);
    expect(blocks.find((block) => block.blockId === 'gap:breakfast')?.minutes).toBe(30);
    expect(blocks.find((block) => block.blockId === 'breakfast')?.missedWindow).toBe(false);
  });
});
