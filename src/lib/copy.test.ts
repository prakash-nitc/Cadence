import { describe, expect, it } from 'vitest';
import { dayStatusLine } from './copy';

describe('dayStatusLine', () => {
  const base = {
    anchored: true,
    complete: false,
    earnedMinutes: 0,
    committedMinutes: 0,
    runningLabel: null,
  };

  it('says what to do before the day is laid', () => {
    expect(dayStatusLine({ ...base, anchored: false })).toBe(
      'No day laid out yet. Start it below.',
    );
  });

  it('reports progress as a share of committed minutes', () => {
    expect(
      dayStatusLine({ ...base, earnedMinutes: 130, committedMinutes: 650 }),
    ).toBe('20% of today’s committed minutes done');
  });

  it('names the block that is running', () => {
    expect(
      dayStatusLine({
        ...base,
        earnedMinutes: 60,
        committedMinutes: 120,
        runningLabel: 'DSA deep block',
      }),
    ).toBe('DSA deep block · 50% of today’s committed minutes done');
  });

  it('says the day is finished once every block is marked', () => {
    expect(dayStatusLine({ ...base, complete: true })).toBe(
      'Every block marked. Log it on Plan.',
    );
  });

  it('does not divide by zero with nothing committed', () => {
    expect(dayStatusLine(base)).toBe('Nothing committed to today.');
    expect(dayStatusLine({ ...base, runningLabel: 'Recall drill' })).toBe(
      'Recall drill is running, with nothing committed to today.',
    );
  });

  it('never encourages', () => {
    // Rule 7. The line states where the day stands and stops.
    const lines = [
      dayStatusLine(base),
      dayStatusLine({ ...base, anchored: false }),
      dayStatusLine({ ...base, complete: true }),
      dayStatusLine({ ...base, earnedMinutes: 10, committedMinutes: 100 }),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/!|let'?s|keep going|well done|great|nearly there/i);
    }
  });
});
