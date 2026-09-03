import { describe, expect, it } from 'vitest';
import { backupState, dayStatusLine } from './copy';

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

describe('backupState', () => {
  const day = 86_400_000;
  const now = Date.parse('2026-09-20T12:00:00');

  it('says plainly when there has never been an export', () => {
    const state = backupState(null, 14, now);
    expect(state.overdue).toBe(true);
    expect(state.daysSince).toBeNull();
    expect(state.line).toBe('Never exported. Everything lives in this browser only.');
  });

  it('counts whole days since the last one', () => {
    expect(backupState(now - 3 * day, 14, now).daysSince).toBe(3);
    expect(backupState(now - 3 * day, 14, now).line).toBe('Last exported 3 days ago.');
  });

  it('reads naturally on the edges', () => {
    expect(backupState(now - 2 * 3_600_000, 14, now).line).toBe('Exported today.');
    expect(backupState(now - day, 14, now).line).toBe('Last exported 1 day ago.');
  });

  it('goes overdue on the reminder day, not after it', () => {
    expect(backupState(now - 13 * day, 14, now).overdue).toBe(false);
    expect(backupState(now - 14 * day, 14, now).overdue).toBe(true);
  });

  it('can be switched off entirely', () => {
    // Zero disables it, including the never-exported case that is otherwise always overdue.
    expect(backupState(null, 0, now).overdue).toBe(false);
    expect(backupState(now - 400 * day, 0, now).overdue).toBe(false);
  });

  it('does not scold', () => {
    // Rule 7. It states the fact; Settings offers the button.
    for (const state of [backupState(null, 14, now), backupState(now - 90 * day, 14, now)]) {
      expect(state.line).not.toMatch(/!|should|must|you failed|warning|danger/i);
    }
  });
});
