import { describe, expect, it } from 'vitest';
import type { DayRecord } from '../db/schema';
import { beatYesterday, workedOn } from './beat';
import type { ScheduledBlock } from './layout';

const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00`);

const block = (
  date: string,
  id: string,
  from: string,
  to: string,
  over: Partial<ScheduledBlock> = {},
): ScheduledBlock => ({
  blockId: id,
  label: id,
  detail: null,
  kind: 'work',
  priority: 1,
  minutes: (at(date, to) - at(date, from)) / 60_000,
  startsAt: at(date, from),
  endsAt: at(date, to),
  status: 'pending',
  actualEndedAt: null,
  missedWindow: false,
  straddles: null,
  window: null,
  ...over,
});

const day = (date: string, blocks: ScheduledBlock[]): DayRecord => ({
  date,
  anchorAt: at(date, '07:00'),
  template: 'full',
  blocks,
  degradation: [],
  pushes: [],
  placementMode: false,
  score: null,
  band: null,
  gatePassed: null,
  plannedAt: at(date, '06:00'),
  plannedBlocks: null,
  plannedAnchor: null,
});

const Y = '2026-09-16';
const T = '2026-09-17';

const yesterday = day(Y, [
  block(Y, 'dsa', '10:00', '13:00', { status: 'contained', workedMinutes: 160 }),
  block(Y, 'cse', '14:00', '16:00', { status: 'overran', workedMinutes: 90 }),
  block(Y, 'lunch', '13:00', '14:00', { kind: 'meal', status: 'contained', workedMinutes: 60 }),
]);

describe('beat — time worked', () => {
  it('adds the minutes answered on closed work blocks, and ignores meals', () => {
    expect(workedOn(yesterday, at(T, '09:00'))).toBe(250);
  });

  it('counts a running timer live', () => {
    const today = day(T, [
      block(T, 'dsa', '10:00', '13:00', { timer: [{ start: at(T, '10:00'), end: null, seen: at(T, '10:40') }] }),
    ]);
    expect(workedOn(today, at(T, '10:40'))).toBe(40);
  });

  it('prefers the answered minutes once a timed block is closed', () => {
    const today = day(T, [
      block(T, 'dsa', '10:00', '13:00', {
        status: 'contained',
        workedMinutes: 150,
        timer: [{ start: at(T, '10:00'), end: at(T, '12:00'), seen: at(T, '12:00'), endedBy: 'close' }],
      }),
    ]);
    expect(workedOn(today, at(T, '15:00'))).toBe(150);
  });

  it('is zero for a day with no record', () => {
    expect(workedOn(null, at(T, '10:00'))).toBe(0);
  });
});

describe('beat — the comparison', () => {
  it('says how far there is to go', () => {
    const today = day(T, [block(T, 'dsa', '10:00', '13:00', { status: 'contained', workedMinutes: 80 })]);
    expect(beatYesterday(today, yesterday, at(T, '14:00'))).toEqual({
      today: 80,
      yesterday: 250,
      toGo: 170,
      ahead: 0,
      hasYesterday: true,
    });
  });

  it('says how far past it you are', () => {
    const today = day(T, [block(T, 'dsa', '10:00', '16:00', { status: 'contained', workedMinutes: 265 })]);
    expect(beatYesterday(today, yesterday, at(T, '17:00'))).toMatchObject({ toGo: 0, ahead: 15 });
  });

  it('has nothing to race when yesterday has no time worked', () => {
    const today = day(T, [block(T, 'dsa', '10:00', '13:00', { status: 'contained', workedMinutes: 30 })]);
    expect(beatYesterday(today, null, at(T, '14:00'))).toEqual({
      today: 30,
      yesterday: 0,
      toGo: 0,
      ahead: 0,
      hasYesterday: false,
    });
  });
});
