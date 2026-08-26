import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../config/schedule.config';
import type { Prefs } from '../lib/prefs';
import {
  checkFeasibility,
  committableMinutes,
  type HistoricCommitment,
  type Proposed,
} from './feasibility';

const prefs: Prefs = DEFAULT_PREFS;
const withPrefs = (over: Partial<Prefs>): Prefs => ({ ...prefs, ...over });

const p = (id: string, plannedMinutes: number, target = 1, tags: string[] = []): Proposed => ({
  id,
  label: id,
  target,
  plannedMinutes,
  tags,
});

/** `days` days of history, each logging `done` against `tag`. */
const historyOf = (tag: string, dailyTotals: number[]): HistoricCommitment[] =>
  dailyTotals.map((done, index) => ({
    dayDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
    tags: [tag],
    done,
  }));

describe('committableMinutes', () => {
  it('counts work blocks only — a meal is not a slot you can commit into', () => {
    expect(
      committableMinutes([
        { kind: 'work', minutes: 180 },
        { kind: 'meal', minutes: 60 },
        { kind: 'break', minutes: 15 },
        { kind: 'routine', minutes: 40 },
        { kind: 'work', minutes: 100 },
      ]),
    ).toBe(280);
  });
});

describe('checkFeasibility — the slack rule', () => {
  it('plans to 85% of available time by default', () => {
    // Nine hours free means committing seven and a half — SPEC §4.2.
    const verdict = checkFeasibility([p('a', 450)], 540, [], prefs);
    expect(verdict.slackMinutes).toBe(459);
    expect(verdict.status).toBe('within');
    expect(verdict.overBy).toBe(0);
  });

  it('warns past the slack line without calling it over capacity', () => {
    const verdict = checkFeasibility([p('a', 500)], 540, [], prefs);
    expect(verdict.status).toBe('overSlack');
    expect(verdict.overBy).toBe(41);
  });

  it('calls it over capacity only past the available time itself', () => {
    const verdict = checkFeasibility([p('a', 600)], 540, [], prefs);
    expect(verdict.status).toBe('overCapacity');
  });

  it('sits exactly on the slack line without warning', () => {
    expect(checkFeasibility([p('a', 459)], 540, [], prefs).status).toBe('within');
  });

  it('reads the slack from settings', () => {
    const verdict = checkFeasibility([p('a', 500)], 540, [], withPrefs({ planningSlack: 1 }));
    expect(verdict.slackMinutes).toBe(540);
    expect(verdict.status).toBe('within');
  });

  it('sums every proposed commitment', () => {
    const verdict = checkFeasibility([p('a', 180), p('b', 100), p('c', 20)], 540, [], prefs);
    expect(verdict.committedMinutes).toBe(300);
  });
});

describe('checkFeasibility — the history check', () => {
  const proposed = [p('dsa', 180, 5, ['dsa'])];

  it('says nothing before there are enough logged days', () => {
    const verdict = checkFeasibility(proposed, 540, historyOf('dsa', [5, 5, 5]), prefs);
    expect(verdict.historyReady).toBe(false);
    expect(verdict.historyDays).toBe(3);
    expect(verdict.notes).toEqual([]);
  });

  it('quotes the user record back once there are fourteen', () => {
    // 14 days, two of them reaching 5.
    const verdict = checkFeasibility(
      proposed,
      540,
      historyOf('dsa', [5, 2, 3, 1, 4, 6, 0, 2, 3, 1, 2, 4, 3, 2]),
      prefs,
    );
    expect(verdict.historyReady).toBe(true);
    expect(verdict.notes).toEqual([
      { commitmentId: 'dsa', label: 'dsa', tag: 'dsa', target: 5, hits: 2, days: 14 },
    ]);
  });

  it('counts the day total for a tag, not each commitment separately', () => {
    // Three problems in the morning and two in the evening is a five-problem day.
    const split: HistoricCommitment[] = [
      ...historyOf('dsa', Array<number>(13).fill(0)),
      { dayDate: '2026-08-20', tags: ['dsa'], done: 3 },
      { dayDate: '2026-08-20', tags: ['dsa'], done: 2 },
    ];
    const verdict = checkFeasibility(proposed, 540, split, prefs);
    expect(verdict.notes[0]).toMatchObject({ hits: 1, days: 14 });
  });

  it('reads the window length from settings', () => {
    const verdict = checkFeasibility(
      proposed,
      540,
      historyOf('dsa', [5, 5, 5]),
      withPrefs({ historyWindowDays: 3 }),
    );
    expect(verdict.historyReady).toBe(true);
    expect(verdict.notes[0]).toMatchObject({ hits: 3, days: 3 });
  });

  it('says nothing about a tag with no record at all', () => {
    const verdict = checkFeasibility(
      [p('spring', 100, 90, ['spring'])],
      540,
      historyOf('dsa', Array<number>(14).fill(3)),
      prefs,
    );
    expect(verdict.notes).toEqual([]);
  });

  it('says nothing about an untagged commitment', () => {
    const verdict = checkFeasibility(
      [p('flex', 90, 1, [])],
      540,
      historyOf('dsa', Array<number>(14).fill(3)),
      prefs,
    );
    expect(verdict.notes).toEqual([]);
  });

  it('never blocks — it is a number, not a veto', () => {
    const verdict = checkFeasibility(
      [p('dsa', 100, 99, ['dsa'])],
      540,
      historyOf('dsa', Array<number>(14).fill(0)),
      prefs,
    );
    expect(verdict.notes[0]).toMatchObject({ hits: 0 });
    expect(verdict.status).toBe('within');
  });
});

describe('checkFeasibility — an empty plan', () => {
  it('is within slack and commits nothing', () => {
    const verdict = checkFeasibility([], 540, [], prefs);
    expect(verdict.committedMinutes).toBe(0);
    expect(verdict.status).toBe('within');
  });
});
