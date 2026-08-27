import type { TargetPace } from '../engine/pacing';

/**
 * One weekly target with its required daily rate — SPEC §4.3.
 *
 * > Spring Boot 6.5 / 15 hrs. 3 days left. Need 2.8 hrs/day.
 *
 * And when the week can no longer reach it, that is stated rather than implied by a
 * rate nobody could hit. Displacement debt sits on the same row, because the two
 * numbers only mean anything together.
 */
const rate = (value: number, unit: string): string =>
  `${value} ${unit === 'hours' ? 'hrs' : unit}/day`;

export function TargetBar({ pace }: { pace: TargetPace }) {
  const met = pace.achieved >= pace.min;
  const progress = pace.min === 0 ? 1 : Math.min(1, pace.achieved / pace.min);

  const tone = pace.belowWarn ? 'bg-fail' : met ? 'bg-pass' : 'bg-signal';

  return (
    <div className="border-b border-edge px-3 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-text">{pace.label}</span>
        <span className="shrink-0 font-mono text-xs text-muted">
          {pace.tracked ? (
            <>
              <span className={pace.belowWarn ? 'text-fail' : met ? 'text-pass' : 'text-text'}>
                {pace.achieved}
              </span>
              {' / '}
              {pace.min}
              {pace.max && pace.max !== pace.min ? `–${pace.max}` : ''} {pace.unit}
            </>
          ) : (
            'not tracked here'
          )}
        </span>
      </div>

      {pace.tracked ? (
        <div className="mt-1.5 h-1 w-full bg-edge">
          <div className={`h-1 ${tone}`} style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}

      {pace.tracked ? (
        <p className="mt-1 font-mono text-xs">
          {!pace.reachable ? (
            <span className="text-fail">
              Not reachable this week. Short by {pace.shortBy} {pace.unit}.
            </span>
          ) : pace.requiredRate !== null ? (
            <span className="text-muted">
              {pace.remainingDays} {pace.remainingDays === 1 ? 'day' : 'days'} left.{' '}
              <span className="text-text">
                {pace.ratePerDay
                  ? `Need ${rate(pace.requiredRate, pace.unit)}.`
                  : `Need ${pace.shortfall} more.`}
              </span>
            </span>
          ) : (
            <span className="text-pass">Met.</span>
          )}
        </p>
      ) : null}

      {pace.displaced.count > 0 ? (
        <p className="mt-0.5 text-xs text-muted">
          Displaced {pace.displaced.count === 1 ? 'once' : `${pace.displaced.count} times`}
          {pace.displaced.reasons.length > 0 ? ` — ${pace.displaced.reasons.join(', ')}` : ''}.
        </p>
      ) : null}
    </div>
  );
}
