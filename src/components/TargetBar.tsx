import type { TargetPace } from '../engine/pacing';

/**
 * One weekly target — SPEC §4.3.
 *
 * > Spring Boot 6.5 / 15 hrs. 3 days left. Need 2.8 hrs/day.
 *
 * The bar carries a pace marker: where the target would be if the week had gone evenly.
 * Without it "0 / 16" says nothing — zero on a Monday is fine and zero on a Saturday is
 * a week already lost, and the whole point of this screen is telling those apart.
 */
const unitShort = (unit: string): string => (unit === 'hours' ? 'hrs' : unit);

const round = (value: number): number => Math.round(value * 10) / 10;

interface TargetBarProps {
  pace: TargetPace;
  /** Days in the period, so the pace marker knows how far through it is. */
  totalDays: number;
}

export function TargetBar({ pace, totalDays }: TargetBarProps) {
  if (!pace.tracked) {
    return (
      <div className="flex items-baseline justify-between gap-3 border-b border-edge px-3 py-2 last:border-b-0 opacity-50">
        <span className="text-sm text-muted">{pace.label}</span>
        <span className="shrink-0 font-mono text-xs text-muted">not tracked here</span>
      </div>
    );
  }

  const met = pace.achieved >= pace.min;
  const progress = pace.min <= 0 ? 1 : Math.min(1, pace.achieved / pace.min);

  // Where an even week would have you by now.
  const elapsed = Math.max(0, Math.min(totalDays, totalDays - pace.remainingDays));
  const pacePercent = totalDays > 0 ? (elapsed / totalDays) * 100 : 0;
  const expected = pace.min * (elapsed / Math.max(1, totalDays));
  const behind = round(Math.max(0, expected - pace.achieved));

  const tone = pace.belowWarn ? 'bg-fail' : met ? 'bg-pass' : behind > 0 ? 'bg-signal' : 'bg-pass';
  const valueTone = pace.belowWarn ? 'text-fail' : met ? 'text-pass' : 'text-text';

  return (
    <div className="border-b border-edge px-3 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm text-text">{pace.label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
          <span className={valueTone}>{pace.achieved}</span>
          <span className="text-muted">
            {' / '}
            {pace.min}
            {pace.max && pace.max !== pace.min ? `–${pace.max}` : ''} {unitShort(pace.unit)}
          </span>
        </span>
      </div>

      <div className="relative mt-2 h-1.5 w-full bg-edge">
        <div className={`h-full ${tone}`} style={{ width: `${progress * 100}%` }} />

        {!met && pacePercent > 0 && pacePercent < 100 ? (
          <div
            className="absolute top-0 h-full w-px bg-text/60"
            style={{ left: `${pacePercent}%` }}
            title={`On an even week: ${round(expected)} by now`}
            aria-hidden
          />
        ) : null}
      </div>

      <p className="mt-1.5 font-mono text-xs">
        {!pace.reachable ? (
          <span className="text-fail">
            Not reachable this week. Short by {pace.shortBy} {unitShort(pace.unit)}.
          </span>
        ) : met ? (
          <span className="text-pass">Met.</span>
        ) : pace.requiredRate !== null ? (
          <>
            <span className="text-text">
              {pace.ratePerDay
                ? `Need ${pace.requiredRate} ${unitShort(pace.unit)}/day.`
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

      {pace.displaced.count > 0 ? (
        <p className="mt-0.5 text-xs text-muted">
          Displaced {pace.displaced.count === 1 ? 'once' : `${pace.displaced.count} times`}
          {pace.displaced.reasons.length > 0 ? ` — ${pace.displaced.reasons.join(', ')}` : ''}.
        </p>
      ) : null}
    </div>
  );
}
