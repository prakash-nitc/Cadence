import type { TargetPace } from '../engine/pacing';
import { Icon } from './ui/Icon';
import { Bar, type Tone } from './ui/primitives';

/**
 * One weekly target as a card — SPEC §4.3, §27 of the redesign brief.
 *
 * > Spring Boot 6.5 / 15 hrs. 3 days left. Need 2.8 hrs/day.
 *
 * The bar carries a pace marker: where the target would be if the week had gone evenly.
 * Without it "0 / 16" says nothing — zero on a Monday is fine and zero on a Saturday is
 * a week already lost, and telling those apart is the whole point of this screen.
 *
 * §36: the state stays honest and the wording stays constructive. A target that cannot be
 * reached says so, and then says what it would take, rather than simply reporting failure.
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
      <div className="flex items-baseline justify-between gap-3 rounded-lg border border-dashed border-edge px-4 py-3">
        <span className="text-sm text-muted">{pace.label}</span>
        <span className="shrink-0 text-xs text-muted">not tracked here</span>
      </div>
    );
  }

  const met = pace.achieved >= pace.min;
  const progress = pace.min <= 0 ? 1 : Math.min(1, pace.achieved / pace.min);

  // Where an even week would have you by now.
  const elapsed = Math.max(0, Math.min(totalDays, totalDays - pace.remainingDays));
  const paceFraction = totalDays > 0 ? elapsed / totalDays : 0;
  const expected = pace.min * paceFraction;
  const behind = round(Math.max(0, expected - pace.achieved));

  const tone: Tone = pace.belowWarn ? 'fail' : met ? 'pass' : behind > 0 ? 'warn' : 'pass';
  const valueTone = pace.belowWarn ? 'text-fail' : met ? 'text-deep' : 'text-text';

  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm font-medium text-text">{pace.label}</span>
        <span className="shrink-0 font-mono text-sm tabular-nums">
          <span className={`text-base font-semibold ${valueTone}`}>{pace.achieved}</span>
          <span className="text-muted">
            {' / '}
            {pace.min}
            {pace.max && pace.max !== pace.min ? `–${pace.max}` : ''} {unitShort(pace.unit)}
          </span>
        </span>
      </div>

      <div className="mt-2.5">
        <Bar
          value={progress}
          tone={tone}
          height="h-2"
          animate={false}
          {...(!met && paceFraction > 0 && paceFraction < 1 ? { marker: paceFraction } : {})}
        />
      </div>

      <p className="mt-2 text-xs">
        {!pace.reachable ? (
          <span className="flex items-center gap-1.5 text-fail">
            <Icon name="alert" size={13} />
            Out of reach this week — short by {pace.shortBy} {unitShort(pace.unit)}.
          </span>
        ) : met ? (
          <span className="flex items-center gap-1.5 text-deep">
            <Icon name="check" size={13} />
            Met.
          </span>
        ) : pace.requiredRate !== null ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-text">
              {pace.ratePerDay
                ? `${pace.requiredRate} ${unitShort(pace.unit)}/day to close it`
                : `${pace.shortfall} more to close it`}
            </span>
            {behind > 0 ? (
              <span className="text-muted">
                · {behind} {unitShort(pace.unit)} behind an even week
              </span>
            ) : (
              <span className="text-deep">· on pace</span>
            )}
          </span>
        ) : null}
      </p>

      {pace.displaced.count > 0 ? (
        <p className="mt-1 text-xs text-muted">
          Displaced {pace.displaced.count === 1 ? 'once' : `${pace.displaced.count} times`}
          {pace.displaced.reasons.length > 0 ? ` — ${pace.displaced.reasons.join(', ')}` : ''}.
        </p>
      ) : null}
    </div>
  );
}
