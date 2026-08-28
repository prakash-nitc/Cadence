import type { MonthPace } from '../engine/pacing';
import { NumberField } from './NumberField';

/**
 * One monthly target — SPEC §4.4.
 *
 * The same shape as a weekly one, paced by week rather than by day, with the month broken
 * down into the weeks that made it. Knowing you are twenty hours short says nothing about
 * which week lost them; the strip does.
 */
const unitShort = (unit: string): string => (unit === 'hours' ? 'hrs' : unit);

const round = (value: number): number => Math.round(value * 10) / 10;

interface MonthTargetBarProps {
  pace: MonthPace;
  totalWeeks: number;
  /** Editing the month's own number, rather than the weekly one in config. */
  editing: boolean;
  onMin: (min: number) => void;
}

export function MonthTargetBar({ pace, totalWeeks, editing, onMin }: MonthTargetBarProps) {
  if (!pace.tracked) {
    return (
      <div className="flex items-baseline justify-between gap-3 border-b border-edge px-3 py-2 opacity-50 last:border-b-0">
        <span className="text-sm text-muted">{pace.label}</span>
        <span className="shrink-0 font-mono text-xs text-muted">not tracked here</span>
      </div>
    );
  }

  const met = pace.achieved >= pace.min;
  const progress = pace.min <= 0 ? 1 : Math.min(1, pace.achieved / pace.min);

  const elapsed = Math.max(0, Math.min(totalWeeks, totalWeeks - pace.weeksRemaining));
  const pacePercent = totalWeeks > 0 ? (elapsed / totalWeeks) * 100 : 0;
  const expected = pace.min * (elapsed / Math.max(1, totalWeeks));
  const behind = round(Math.max(0, expected - pace.achieved));

  const tone = pace.belowWarn ? 'bg-fail' : met ? 'bg-pass' : behind > 0 ? 'bg-signal' : 'bg-pass';
  const valueTone = pace.belowWarn ? 'text-fail' : met ? 'text-pass' : 'text-text';

  // Scale the week bars against the biggest week, so a quiet month still shows shape.
  const peak = Math.max(...pace.weeks.map((week) => week.achieved), 1);

  return (
    <div className="border-b border-edge px-3 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm text-text">{pace.label}</span>

        {editing ? (
          <span className="flex shrink-0 items-baseline gap-1.5">
            <NumberField
              value={pace.min}
              onChange={onMin}
              min={0}
              label={`${pace.label} monthly target`}
              className="w-20 border border-edge bg-ink px-1.5 py-1 text-right font-mono text-xs text-text focus:border-signal focus:outline-none"
            />
            <span className="font-mono text-xs text-muted">{unitShort(pace.unit)}</span>
          </span>
        ) : (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
            <span className={valueTone}>{pace.achieved}</span>
            <span className="text-muted">
              {' / '}
              {pace.min} {unitShort(pace.unit)}
            </span>
          </span>
        )}
      </div>

      {!editing ? (
        <>
          <div className="relative mt-2 h-1.5 w-full bg-edge">
            <div className={`h-full ${tone}`} style={{ width: `${progress * 100}%` }} />
            {!met && pacePercent > 0 && pacePercent < 100 ? (
              <div
                className="absolute top-0 h-full w-px bg-text/60"
                style={{ left: `${pacePercent}%` }}
                title={`On an even month: ${round(expected)} by now`}
                aria-hidden
              />
            ) : null}
          </div>

          <p className="mt-1.5 font-mono text-xs">
            {!pace.reachable ? (
              <span className="text-fail">
                Not reachable this month. Short by {pace.shortBy} {unitShort(pace.unit)}.
              </span>
            ) : met ? (
              <span className="text-pass">Met.</span>
            ) : pace.requiredPerWeek !== null ? (
              <>
                <span className="text-text">
                  {pace.ratePerWeek
                    ? `Need ${pace.requiredPerWeek} ${unitShort(pace.unit)}/week.`
                    : `Need ${pace.shortfall} more.`}
                </span>
                {behind > 0 ? (
                  <span className="text-muted"> {behind} behind pace.</span>
                ) : (
                  <span className="text-pass"> On pace.</span>
                )}
              </>
            ) : null}
          </p>

          {/* What each week of the month actually put in. */}
          <div className="mt-2 flex items-end gap-0.5">
            {pace.weeks.map((week, index) => (
              <div key={week.from} className="flex-1">
                <div
                  className="flex h-5 items-end bg-edge"
                  title={`${week.from} to ${week.to} — ${week.achieved} ${unitShort(pace.unit)}`}
                >
                  <div
                    className={`w-full ${week.achieved > 0 ? 'bg-muted' : ''}`}
                    style={{ height: `${(week.achieved / peak) * 100}%` }}
                  />
                </div>
                <span className="mt-0.5 block text-center font-mono text-[10px] text-muted">
                  W{index + 1}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {!editing && pace.displaced.count > 0 ? (
        <p className="mt-1 text-xs text-muted">
          Displaced {pace.displaced.count === 1 ? 'once' : `${pace.displaced.count} times`}
          {pace.displaced.reasons.length > 0 ? ` — ${pace.displaced.reasons.join(', ')}` : ''}.
        </p>
      ) : null}
    </div>
  );
}
