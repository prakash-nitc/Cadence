/**
 * Beat yesterday — SPEC §3.1.
 *
 * Asked for by the user as a daily push. The card is named for the goal, and everything in it
 * is a fact: yesterday's time worked, today's so far, and the gap between them. It moves live
 * while a block is being timed, so the gap closing is something you can watch.
 *
 * Compared against yourself only, and never shamed: a day behind reads as minutes to go, not
 * as a failure.
 */
import type { BeatYesterday as Beat } from '../../engine/beat';
import { formatDuration } from '../../lib/time';

export function BeatYesterday({ beat }: { beat: Beat }) {
  const passed = beat.hasYesterday && beat.today >= beat.yesterday;
  const scale = Math.max(beat.today, beat.yesterday, 1);

  return (
    <section className="card p-5" data-beat={passed ? 'passed' : beat.hasYesterday ? 'racing' : 'none'}>
      <p className="eyebrow">Beat yesterday</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted">Yesterday</p>
          <p className="font-mono text-xl text-soft" data-beat-yesterday>
            {beat.hasYesterday ? formatDuration(beat.yesterday) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Today so far</p>
          <p className={`font-mono text-xl ${passed ? 'text-deep' : 'text-text'}`} data-beat-today>
            {formatDuration(beat.today)}
          </p>
        </div>
      </div>

      {beat.hasYesterday ? (
        <div className="mt-4">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-sunk" aria-hidden>
            <span
              className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${
                passed ? 'bg-signal' : 'bg-signal/70'
              }`}
              style={{ width: `${(beat.today / scale) * 100}%` }}
            />
            {/* Where yesterday ended: the line to cross. */}
            <span
              className="absolute inset-y-0 w-0.5 bg-text/60"
              style={{ left: `calc(${(beat.yesterday / scale) * 100}% - 1px)` }}
            />
          </div>
          <p className="mt-2 text-sm text-soft" data-beat-line>
            {passed ? (
              beat.ahead === 0 ? (
                <>Level with yesterday.</>
              ) : (
                <>
                  Past yesterday by <span className="font-mono text-deep">{formatDuration(beat.ahead)}</span>.
                </>
              )
            ) : (
              <>
                <span className="font-mono text-text">{formatDuration(beat.toGo)}</span> to pass
                yesterday.
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-soft" data-beat-line>
          No time worked on record yesterday. Today sets the mark for tomorrow.
        </p>
      )}

      <p className="mt-3 text-xs text-muted">
        Time worked on work blocks — what you logged, or the timer while a block runs.
      </p>
    </section>
  );
}
