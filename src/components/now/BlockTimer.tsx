/**
 * The block timer on Now — SPEC §3.3.
 *
 * Sits above Done, because what it measures is the answer Done asks for. It starts itself;
 * the one decision left to the user is a pause, and the row says plainly which state it is
 * in so a paused timer is never mistaken for a running one.
 */
import type { ScheduledBlock } from '../../engine/layout';
import { hasTimer, openSession, timedMinutes } from '../../engine/timer';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/primitives';

const clock = (minutes: number): string => {
  const seconds = Math.max(0, Math.floor(minutes * 60));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export function BlockTimer({
  block,
  now,
  onStart,
  onPause,
}: {
  block: ScheduledBlock;
  now: number;
  onStart: () => void;
  onPause: () => void;
}) {
  const running = openSession(block) !== null;
  const minutes = timedMinutes(block, now);
  const state = running ? 'Timing' : hasTimer(block) ? 'Paused' : 'Not timing yet';

  return (
    <div
      className="mb-4 flex items-center gap-3 border-b border-edge pb-4"
      data-block-timer={running ? 'running' : hasTimer(block) ? 'paused' : 'idle'}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          running ? 'bg-wash text-deep' : 'bg-sunk text-muted'
        }`}
        aria-hidden
      >
        <Icon name="clock" size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{state}</p>
        <p className="font-mono text-lg text-text" data-timer-value>
          {clock(minutes)}
          <span className="ml-2 font-sans text-xs text-muted">worked on this block</span>
        </p>
      </div>
      {running ? (
        <Button size="sm" icon="minus" onClick={onPause}>
          Pause
        </Button>
      ) : (
        <Button size="sm" variant="primary" icon="plus" onClick={onStart}>
          {hasTimer(block) ? 'Resume' : 'Start'}
        </Button>
      )}
    </div>
  );
}
