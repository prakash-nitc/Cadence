import { describe, expect, it } from 'vitest';
import {
  dayShape,
  shapeVerdict,
  sizeFor,
  suggestedSize,
  type ShapeTarget,
  type SizeThresholds,
} from './shape';

const thresholds: SizeThresholds = { bigMinutes: 90, mediumMinutes: 45 };
const target: ShapeTarget = { big: 1, medium: 2, small: 3 };

const items = (...minutes: number[]) => minutes.map((plannedMinutes) => ({ plannedMinutes }));

describe('suggestedSize', () => {
  it('sorts by what the commitment is worth, not by its name', () => {
    expect(suggestedSize(180, thresholds)).toBe('big');
    expect(suggestedSize(60, thresholds)).toBe('medium');
    expect(suggestedSize(20, thresholds)).toBe('small');
  });

  it('is inclusive at each boundary', () => {
    expect(suggestedSize(90, thresholds)).toBe('big');
    expect(suggestedSize(89, thresholds)).toBe('medium');
    expect(suggestedSize(45, thresholds)).toBe('medium');
    expect(suggestedSize(44, thresholds)).toBe('small');
  });

  it('treats a weightless commitment as small', () => {
    expect(suggestedSize(0, thresholds)).toBe('small');
  });
});

describe('sizeFor', () => {
  it('uses the minutes when nothing has been chosen', () => {
    expect(sizeFor({ plannedMinutes: 180 }, thresholds)).toBe('big');
    expect(sizeFor({ plannedMinutes: 180, size: null }, thresholds)).toBe('big');
  });

  it('lets the choice win, however long the thing is', () => {
    // Ninety minutes of reading and ninety of a hard new pattern are not the same day.
    expect(sizeFor({ plannedMinutes: 180, size: 'small' }, thresholds)).toBe('small');
    expect(sizeFor({ plannedMinutes: 10, size: 'big' }, thresholds)).toBe('big');
  });
});

describe('dayShape', () => {
  it('counts by the chosen size, not the clock', () => {
    const shape = dayShape(
      [
        { plannedMinutes: 180, size: 'small' },
        { plannedMinutes: 15, size: 'big' },
      ],
      thresholds,
    );
    expect(shape).toMatchObject({ big: 1, medium: 0, small: 1, minutes: 195 });
  });

  it('counts the three buckets and the total', () => {
    expect(dayShape(items(180, 60, 60, 20, 20, 20), thresholds)).toEqual({
      big: 1,
      medium: 2,
      small: 3,
      minutes: 360,
    });
  });

  it('is all zeroes for an empty day', () => {
    expect(dayShape([], thresholds)).toEqual({ big: 0, medium: 0, small: 0, minutes: 0 });
  });
});

describe('shapeVerdict', () => {
  it('says nothing when the shape is met', () => {
    const verdict = shapeVerdict(dayShape(items(180, 60, 60, 20, 20, 20), thresholds), target);
    expect(verdict.matches).toBe(true);
    expect(verdict.note).toBeNull();
  });

  it('counts under the shape as a match', () => {
    // The shape is a ceiling on ambition, not a quota to fill.
    const verdict = shapeVerdict(dayShape(items(180, 60), thresholds), target);
    expect(verdict.matches).toBe(true);
  });

  it('names the big overrun first, because it is the one that decides the day', () => {
    // Eight bigs and four mediums: both are wrong, but only one is worth saying.
    const shape = dayShape(items(150, 120, 120, 110, 100, 100, 90, 90, 60, 60, 60, 60), thresholds);
    const verdict = shapeVerdict(shape, target);
    expect(verdict.shape).toMatchObject({ big: 8, medium: 4, small: 0 });
    expect(verdict.matches).toBe(false);
    expect(verdict.note).toMatch(/8 big things against a shape of 1/);
    expect(verdict.note).not.toMatch(/medium/);
  });

  it('has a gentler line for being over by exactly one', () => {
    const verdict = shapeVerdict(dayShape(items(180, 120), thresholds), target);
    expect(verdict.note).toMatch(/One big thing too many/);
  });

  it('falls through to medium, then to small', () => {
    expect(shapeVerdict(dayShape(items(60, 60, 60), thresholds), target).note).toMatch(
      /3 medium against a shape of 2/,
    );
    expect(
      shapeVerdict(dayShape(items(20, 20, 20, 20), thresholds), target).note,
    ).toMatch(/4 small against a shape of 3/);
  });

  it('flags a day with no big thing, without calling it a failure', () => {
    const verdict = shapeVerdict(dayShape(items(60, 20), thresholds), target);
    expect(verdict.matches).toBe(true);
    expect(verdict.note).toMatch(/Nothing big/);
  });

  it('says so when nothing is committed to at all', () => {
    const verdict = shapeVerdict(dayShape([], thresholds), target);
    expect(verdict.note).toBe('Nothing committed to yet.');
  });

  it('reports the signed difference per size', () => {
    const verdict = shapeVerdict(dayShape(items(120, 120, 60), thresholds), target);
    expect(verdict.over).toEqual({ big: 1, medium: -1, small: -3 });
  });

  it('never scolds', () => {
    // Rule 7: it states the shape and what that usually means, and stops.
    const notes = [
      shapeVerdict(dayShape(items(180, 180, 180), thresholds), target).note,
      shapeVerdict(dayShape(items(20, 20, 20, 20, 20), thresholds), target).note,
      shapeVerdict(dayShape([], thresholds), target).note,
    ];
    for (const note of notes) {
      expect(note).not.toMatch(/!|you failed|too lazy|should have|must/i);
    }
  });
});
