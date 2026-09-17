import { describe, expect, it } from 'vitest';
import type { ScheduledBlock } from './layout';
import {
  AWAY_MS,
  closeTimer,
  openSession,
  pauseTimer,
  startTimer,
  timedMinutes,
  timerTick,
} from './timer';
import { defaultWorked } from './worked';

const at = (hhmm: string) => Date.parse(`2026-09-17T${hhmm}:00`);
const MIN = 60_000;

const block = (id: string, from: string, to: string, over: Partial<ScheduledBlock> = {}): ScheduledBlock => ({
  blockId: id,
  label: id,
  detail: null,
  kind: 'work',
  priority: 1,
  minutes: (at(to) - at(from)) / MIN,
  startsAt: at(from),
  endsAt: at(to),
  status: 'pending',
  actualEndedAt: null,
  missedWindow: false,
  straddles: null,
  window: null,
  ...over,
});

/** Tick once a minute from `from` to `to`, as the app would while open. */
const run = (blocks: ScheduledBlock[], from: number, to: number): ScheduledBlock[] => {
  let current = blocks;
  for (let now = from; now <= to; now += MIN) current = timerTick(current, now) ?? current;
  return current;
};

const dsa = () => block('dsa', '10:00', '13:00');

describe('timer — starting itself', () => {
  it('starts when a work block starts with the app open', () => {
    const [timed] = timerTick([dsa()], at('10:00')) ?? [];
    expect(openSession(timed!)?.start).toBe(at('10:00'));
  });

  it('starts from the moment the app is opened during a block, not from the block\'s start', () => {
    const [timed] = timerTick([dsa()], at('11:20')) ?? [];
    expect(openSession(timed!)?.start).toBe(at('11:20'));
  });

  it('does not start on a meal or a routine', () => {
    expect(timerTick([block('lunch', '13:00', '14:00', { kind: 'meal' })], at('13:10'))).toBeNull();
  });

  it('does not start on a block already closed', () => {
    expect(timerTick([block('dsa', '10:00', '13:00', { status: 'contained' })], at('11:00'))).toBeNull();
  });

  it('writes nothing on a tick that changes nothing', () => {
    const started = timerTick([dsa()], at('10:00'))!;
    expect(timerTick(started, at('10:00') + 20_000)).toBeNull();
  });
});

describe('timer — measuring', () => {
  it('counts a running session up to now', () => {
    const blocks = run([dsa()], at('10:00'), at('11:15'));
    expect(timedMinutes(blocks[0]!, at('11:15'))).toBe(75);
  });

  it('stops at the block\'s end', () => {
    const blocks = run([dsa()], at('10:00'), at('13:30'));
    expect(openSession(blocks[0]!)).toBeNull();
    expect(timedMinutes(blocks[0]!, at('13:30'))).toBe(180);
  });

  it('follows a pushed block past its old end', () => {
    let blocks = run([dsa()], at('10:00'), at('12:50'));
    blocks = blocks.map((entry) => ({ ...entry, endsAt: at('13:30') }));
    blocks = run(blocks, at('12:51'), at('13:20'));
    expect(timedMinutes(blocks[0]!, at('13:20'))).toBe(200);
  });
});

describe('timer — absence', () => {
  it('ends a session where the app was last seen, not where it was found', () => {
    // Open 10:00–10:40, laptop closed, opened again at 12:00.
    let blocks = run([dsa()], at('10:00'), at('10:40'));
    blocks = timerTick(blocks, at('12:00'))!;
    expect(blocks[0]!.timer?.[0]).toMatchObject({ end: at('10:40'), endedBy: 'away' });
  });

  it('resumes when you are back, and counts only the time you were there', () => {
    let blocks = run([dsa()], at('10:00'), at('10:40'));
    blocks = run(blocks, at('12:00'), at('12:30'));
    expect(timedMinutes(blocks[0]!, at('12:30'))).toBe(40 + 30);
  });

  it('treats a gap just over the threshold as absence and one under it as presence', () => {
    let blocks = timerTick([dsa()], at('10:00'))!;
    expect(timerTick(blocks, at('10:00') + AWAY_MS - 1000)).not.toBeNull(); // heartbeat only
    blocks = timerTick(blocks, at('10:00') + AWAY_MS + 1000)!;
    expect(blocks[0]!.timer?.[0]?.endedBy).toBe('away');
  });
});

describe('timer — pausing and closing', () => {
  it('does not start itself again after a pause', () => {
    let blocks = run([dsa()], at('10:00'), at('10:30'));
    blocks = pauseTimer(blocks, 'dsa', at('10:30'));
    blocks = run(blocks, at('10:31'), at('11:00'));
    expect(openSession(blocks[0]!)).toBeNull();
    expect(timedMinutes(blocks[0]!, at('11:00'))).toBe(30);
  });

  it('resumes by hand and adds the new session', () => {
    let blocks = run([dsa()], at('10:00'), at('10:30'));
    blocks = pauseTimer(blocks, 'dsa', at('10:30'));
    blocks = startTimer(blocks, 'dsa', at('10:45'));
    blocks = run(blocks, at('10:46'), at('11:15'));
    expect(timedMinutes(blocks[0]!, at('11:15'))).toBe(60);
  });

  it('runs one timer at a time', () => {
    let blocks = startTimer([dsa(), block('spring', '09:00', '15:00')], 'dsa', at('10:00'));
    blocks = startTimer(blocks, 'spring', at('10:20'));
    expect(openSession(blocks[0]!)).toBeNull();
    expect(openSession(blocks[1]!)).not.toBeNull();
  });

  it('ends at the moment the block is closed', () => {
    let blocks = run([dsa()], at('10:00'), at('11:00'));
    blocks = closeTimer(blocks, 'dsa', at('11:05'));
    expect(blocks[0]!.timer?.[0]).toMatchObject({ end: at('11:05'), endedBy: 'close' });
  });
});

describe('timer — feeds the time-worked question', () => {
  it('offers the timed minutes when the block closes', () => {
    const blocks = run([dsa()], at('10:00'), at('11:37'));
    expect(defaultWorked(blocks[0]!, at('11:37'))).toBe(97);
  });

  it('includes the time before a late start, since the app opened mid-block', () => {
    // Opened at 11:30 in a block that began at 10:00, then timed 20 minutes.
    const blocks = run([dsa()], at('11:30'), at('11:50'));
    expect(defaultWorked(blocks[0]!, at('11:50'))).toBe(90 + 20);
  });

  it('does not add back a pause', () => {
    let blocks = run([dsa()], at('10:00'), at('10:30'));
    blocks = pauseTimer(blocks, 'dsa', at('10:30'));
    blocks = startTimer(blocks, 'dsa', at('11:00'));
    blocks = run(blocks, at('11:01'), at('11:30'));
    expect(defaultWorked(blocks[0]!, at('11:30'))).toBe(60);
  });

  it('falls back to the old guess on a block that was never timed', () => {
    expect(defaultWorked(dsa(), at('12:00'))).toBe(120);
  });
});
