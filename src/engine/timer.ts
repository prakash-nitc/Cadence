/**
 * The block timer — SPEC §3.3.
 *
 * Time worked used to be remembered at the end of a block, and remembered wrong. The timer
 * measures it instead: it runs while a work block runs, and closing the block offers the
 * timed minutes as the answer.
 *
 * The hard part is not counting time nobody worked:
 *
 * - **It starts itself** when a work block is running and Cadence is open — at the block's
 *   start if the app was open then, or the moment the app is opened during the block.
 * - **It stops at the block's end.** Pushing the block moves the end, and the timer follows.
 * - **It notices absence.** An open session carries `seen`, refreshed every minute while the
 *   app is running. A lid closed, the laptop asleep or the app shut all stop the refresh; the
 *   next tick ends the session where it was last seen rather than where it was found.
 * - **Pause is respected.** A paused block does not start itself again. A block stopped by
 *   absence does, when you are back, because leaving was not a decision to stop.
 *
 * Pure. The clock is passed in.
 */
import { blockAt, isResolved } from './boundaries';
import type { ScheduledBlock } from './layout';

export interface TimerSession {
  start: number;
  /** Null while running. */
  end: number | null;
  /** Last moment the app was seen running during this session. */
  seen: number;
  /** Why it ended: a pause, absence, the block's end, or the block being closed. */
  endedBy?: 'pause' | 'away' | 'end' | 'close';
}

/** How often a running session records that the app is still open. */
export const HEARTBEAT_MS = 60_000;

/** Silence longer than this means nobody was there. Comfortably over two heartbeats. */
export const AWAY_MS = 3 * 60_000;

const sessionsOf = (block: ScheduledBlock): TimerSession[] => block.timer ?? [];

export function openSession(block: ScheduledBlock): TimerSession | null {
  const last = sessionsOf(block).at(-1);
  return last && last.end === null ? last : null;
}

/** Minutes timed on a block, counting a running session up to now or the block's end. */
export function timedMinutes(block: ScheduledBlock, now: number): number {
  const ms = sessionsOf(block).reduce((sum, session) => {
    const end = session.end ?? Math.min(now, block.endsAt);
    return sum + Math.max(0, end - session.start);
  }, 0);
  return ms / 60_000;
}

/** Minutes between the block's start and the timer's first start — time it never saw. */
export function timerLeadIn(block: ScheduledBlock): number {
  const first = sessionsOf(block)[0];
  if (!first) return 0;
  return Math.max(0, Math.round((first.start - block.startsAt) / 60_000));
}

export function hasTimer(block: ScheduledBlock): boolean {
  return sessionsOf(block).length > 0;
}

function withSessions(
  blocks: ScheduledBlock[],
  blockId: string,
  change: (sessions: TimerSession[], block: ScheduledBlock) => TimerSession[],
): ScheduledBlock[] {
  return blocks.map((block) =>
    block.blockId === blockId ? { ...block, timer: change(sessionsOf(block), block) } : block,
  );
}

const closeLast = (
  sessions: TimerSession[],
  at: number,
  endedBy: NonNullable<TimerSession['endedBy']>,
): TimerSession[] => {
  const last = sessions.at(-1);
  if (!last || last.end !== null) return sessions;
  return [...sessions.slice(0, -1), { ...last, end: Math.max(last.start, at), endedBy }];
};

/** Stop whatever is running anywhere else: one timer at a time. */
function stopOthers(blocks: ScheduledBlock[], blockId: string, at: number): ScheduledBlock[] {
  return blocks.map((block) =>
    block.blockId !== blockId && openSession(block)
      ? { ...block, timer: closeLast(sessionsOf(block), Math.min(at, block.endsAt), 'pause') }
      : block,
  );
}

export function startTimer(blocks: ScheduledBlock[], blockId: string, at: number): ScheduledBlock[] {
  const target = blocks.find((block) => block.blockId === blockId);
  if (!target || openSession(target) || isResolved(target) || at >= target.endsAt) return blocks;
  return withSessions(stopOthers(blocks, blockId, at), blockId, (sessions) => [
    ...sessions,
    { start: at, end: null, seen: at },
  ]);
}

export function pauseTimer(blocks: ScheduledBlock[], blockId: string, at: number): ScheduledBlock[] {
  return withSessions(blocks, blockId, (sessions, block) =>
    closeLast(sessions, Math.min(at, block.endsAt), 'pause'),
  );
}

/** A block being closed ends its timer where it is closed, or at its end if later. */
export function closeTimer(blocks: ScheduledBlock[], blockId: string, at: number): ScheduledBlock[] {
  const target = blocks.find((block) => block.blockId === blockId);
  if (!target || !openSession(target)) return blocks;
  return withSessions(blocks, blockId, (sessions, block) =>
    closeLast(sessions, Math.min(at, block.endsAt), 'close'),
  );
}

/**
 * Everything the timer does on its own, for one tick of the app's clock.
 *
 * Returns the new blocks when something changed, or null — so a tick that changes nothing
 * writes nothing.
 */
export function timerTick(blocks: ScheduledBlock[], now: number): ScheduledBlock[] | null {
  let changed = false;

  let next = blocks.map((block) => {
    const open = openSession(block);
    if (!open) return block;

    if (now - open.seen > AWAY_MS) {
      changed = true;
      return { ...block, timer: closeLast(sessionsOf(block), Math.min(open.seen, block.endsAt), 'away') };
    }
    if (now >= block.endsAt) {
      changed = true;
      return { ...block, timer: closeLast(sessionsOf(block), block.endsAt, 'end') };
    }
    if (now - open.seen >= HEARTBEAT_MS) {
      changed = true;
      return {
        ...block,
        timer: [...sessionsOf(block).slice(0, -1), { ...open, seen: now }],
      };
    }
    return block;
  });

  const running = blockAt(next, now);
  if (running && running.kind === 'work' && !isResolved(running) && !openSession(running)) {
    const last = sessionsOf(running).at(-1);
    // Start on a block never timed, or resume one stopped by absence. Never undo a pause.
    if (!last || last.endedBy === 'away') {
      next = startTimer(next, running.blockId, now);
      changed = true;
    }
  }

  return changed ? next : null;
}
