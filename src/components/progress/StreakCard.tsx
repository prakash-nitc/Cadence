/**
 * The consistency run — the redesign brief's §13.
 *
 * SPEC §10 ruled streaks out on the grounds that a streak rewards not-breaking over doing
 * well. It is in now because the user asked for it, and the objection is answered in the
 * definition rather than ignored: this counts **days that cleared the red band**, so a run
 * of mediocre days does not accumulate, and an unplanned day breaks it because an
 * unplanned day is red by rule.
 *
 * It also says out loud what it counts. A streak whose rule is invisible is a number you
 * end up gaming by accident.
 *
 * Placement days pass through untouched — §4.6 — and it sits on History rather than on
 * Now, because consistency is level-4 information and must not compete with today.
 */
import type { Streak } from '../../engine/pacing';
import { Icon } from '../ui/Icon';

export function StreakCard({ streak }: { streak: Streak }) {
  const { current, best } = streak;
  const atBest = current > 0 && current === best;

  return (
    <div className="rounded-lg border border-edge bg-panel p-5">
      <p className="eyebrow">Current run</p>

      <p className="mt-3 flex items-baseline gap-2">
        <span
          className={`font-mono text-4xl font-semibold ${current > 0 ? 'text-deep' : 'text-muted'}`}
        >
          {current}
        </span>
        <span className="text-sm text-soft">{current === 1 ? 'day' : 'days'}</span>
      </p>

      <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-muted">
        {atBest ? (
          <>
            <Icon name="sparkle" size={13} className="text-signal" />
            your longest yet
          </>
        ) : (
          `best ${best} ${best === 1 ? 'day' : 'days'}`
        )}
      </p>

      <p className="mt-4 border-t border-edge pt-3 text-xs leading-relaxed text-muted">
        Days in a row that cleared red. An unplanned day is red, so it breaks the run; a
        placement day passes through without counting either way.
      </p>
    </div>
  );
}
