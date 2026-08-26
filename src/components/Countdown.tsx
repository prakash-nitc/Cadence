import { MINUTE_MS } from '../lib/time';

/**
 * The countdown — SPEC §3.1. Monospace tabular numerals, amber at five minutes, and at
 * zero the copy is STOP. It does not go negative and it does not soften.
 */

const AMBER_AT_MS = 5 * MINUTE_MS;

function clockFace(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

interface CountdownProps {
  endsAt: number;
  now: number;
  className?: string;
}

export function Countdown({ endsAt, now, className = '' }: CountdownProps) {
  const remaining = endsAt - now;

  if (remaining <= 0) {
    return (
      <div className={`font-mono font-semibold tracking-block text-fail ${className}`}>STOP</div>
    );
  }

  return (
    <div
      className={`font-mono font-medium tabular-nums ${remaining <= AMBER_AT_MS ? 'text-signal' : 'text-text'} ${className}`}
    >
      {clockFace(remaining)}
    </div>
  );
}

/** Linear progress through a block. No animation beyond the width change. */
export function BlockProgress({
  startsAt,
  endsAt,
  now,
}: {
  startsAt: number;
  endsAt: number;
  now: number;
}) {
  const span = endsAt - startsAt;
  const elapsed = Math.min(Math.max(now - startsAt, 0), span);
  const percent = span <= 0 ? 100 : (elapsed / span) * 100;
  const over = now >= endsAt;

  return (
    <div className="h-1 w-full bg-edge">
      <div
        className={`h-full ${over ? 'bg-fail' : 'bg-signal'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
