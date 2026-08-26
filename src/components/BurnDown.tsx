import type { BurnDown as BurnDownResult } from '../engine/scoring';
import { formatDuration } from '../lib/time';

/**
 * The burn-down strip — SPEC §3.1. Remaining committed minutes against remaining
 * available minutes, red when committed exceeds available, with the gap stated.
 *
 * "4h 20m committed, 3h 05m left." No advice, no "hurry" — the number is the message,
 * and Triage is the action.
 */
interface BurnDownProps {
  result: BurnDownResult;
  onTriage?: () => void;
}

export function BurnDown({ result, onTriage }: BurnDownProps) {
  const { committedMinutes, availableMinutes, overBy, negative } = result;
  const total = Math.max(committedMinutes, availableMinutes, 1);

  return (
    <section>
      <div className="flex h-1.5 w-full overflow-hidden bg-edge">
        <div
          className={negative ? 'bg-fail' : 'bg-signal'}
          style={{ width: `${(committedMinutes / total) * 100}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <p className={`font-mono text-xs ${negative ? 'text-fail' : 'text-muted'}`}>
          {formatDuration(committedMinutes)} committed, {formatDuration(availableMinutes)} left
        </p>

        {negative && onTriage ? (
          <button
            type="button"
            onClick={onTriage}
            className="shrink-0 border border-fail px-2 py-1 text-xs text-fail hover:bg-fail/10"
          >
            Triage day
          </button>
        ) : null}
      </div>

      {negative ? (
        <p className="mt-1 text-xs text-fail">Over-committed by {formatDuration(overBy)}.</p>
      ) : null}
    </section>
  );
}
