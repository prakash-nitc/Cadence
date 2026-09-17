import { describe, expect, it } from 'vitest';
import { backupDue, backupFileName } from './backup';

const at = (iso: string) => Date.parse(iso);

describe('backupDue', () => {
  it('is due straight away when there has never been one', () => {
    expect(backupDue(null, 1, at('2026-09-17T09:00:00'))).toBe(true);
  });

  it('is off at zero days, whatever else is true', () => {
    expect(backupDue(null, 0, at('2026-09-17T09:00:00'))).toBe(false);
  });

  it('counts calendar days, so last night\'s backup does not block this morning\'s', () => {
    expect(backupDue(at('2026-09-16T23:30:00'), 1, at('2026-09-17T07:00:00'))).toBe(true);
  });

  it('is not due twice on the same day', () => {
    expect(backupDue(at('2026-09-17T07:00:00'), 1, at('2026-09-17T23:59:00'))).toBe(false);
  });

  it('waits the full interval when it is longer than a day', () => {
    expect(backupDue(at('2026-09-14T10:00:00'), 7, at('2026-09-20T23:00:00'))).toBe(false);
    expect(backupDue(at('2026-09-14T10:00:00'), 7, at('2026-09-21T06:00:00'))).toBe(true);
  });
});

describe('backupFileName', () => {
  it('names the file by local date', () => {
    expect(backupFileName(at('2026-09-07T23:59:00'))).toBe('cadence-backup-2026-09-07.json');
  });
});
