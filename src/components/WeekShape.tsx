import type { Band } from '../db/schema';
import type { Shape } from '../engine/pacing';

/**
 * Week shape — SPEC §4.3. "4 green · 2 yellow · 1 red — target met."
 *
 * The counts are the headline, but a proportional bar of them says nothing about *which*
 * days went wrong — and three yellows at the end of a week is a different situation from
 * three at the start. So the strip is one cell per day in order, which is the same thing
 * the consistency grid says, at the scale you are looking at.
 */
const TONE: Record<Band, string> = {
  green: 'bg-pass',
  yellow: 'bg-warn',
  red: 'bg-fail',
};

const TEXT_TONE: Record<Band, string> = {
  green: 'text-pass',
  yellow: 'text-warn',
  red: 'text-fail',
};

const WEEKDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * One cell of the strip. `hasRecord` false is a day the app never saw — an empty frame,
 * not a failure, and visibly different from a day whose commitments were all displaced.
 */
export interface ShapeCell {
  date: string;
  band: Band | null;
  score: number | null;
  placementMode: boolean;
  hasRecord: boolean;
}

interface WeekShapeProps {
  shape: Shape;
  label: string;
  /**
   * The whole frame in date order, gaps included — a Monday-to-Sunday week is seven
   * cells whether or not seven days were logged. Showing only the days with records
   * made a five-day week look like the week was five days long.
   */
  cells?: ShapeCell[];
  /** Show a weekday letter under each cell — sensible for a week, not for a month. */
  weekdays?: boolean;
}

const weekdayLetter = (date: string): string => {
  const index = new Date(`${date}T12:00:00`).getDay();
  return WEEKDAY[index === 0 ? 6 : index - 1] ?? '';
};

export function WeekShape({ shape, label, cells, weekdays = false }: WeekShapeProps) {
  const counts: { band: Band; count: number }[] = [
    { band: 'green', count: shape.green },
    { band: 'yellow', count: shape.yellow },
    { band: 'red', count: shape.red },
  ];

  const total = shape.green + shape.yellow + shape.red + shape.unscored;

  return (
    <section className="border border-edge bg-panel p-3">
      <p className="text-xs uppercase tracking-block text-muted">{label}</p>

      <p className="mt-1.5 font-mono text-sm">
        {counts.map((cell, index) => (
          <span key={cell.band}>
            {index > 0 ? <span className="text-muted"> · </span> : null}
            <span className={TEXT_TONE[cell.band]}>
              {cell.count} {cell.band}
            </span>
          </span>
        ))}
        {shape.unscored > 0 ? (
          <span className="text-muted"> · {shape.unscored} displaced</span>
        ) : null}
      </p>

      <p className={`mt-0.5 text-xs ${shape.targetMet ? 'text-pass' : 'text-muted'}`}>
        {shape.targetMet ? 'Target met.' : 'Target missed.'}
      </p>

      {cells && cells.length > 0 ? (
        <div className="mt-2.5">
          <div className="flex gap-0.5">
            {cells.map((day) => (
              <div
                key={day.date}
                className={`h-6 flex-1 ${
                  !day.hasRecord
                    ? 'bg-ink'
                    : day.band
                      ? TONE[day.band]
                      : 'border border-edge bg-transparent'
                } ${day.placementMode ? 'ring-1 ring-inset ring-signal' : ''}`}
                title={`${day.date} — ${
                  !day.hasRecord
                    ? 'no record'
                    : day.band
                      ? `${day.score ?? '—'}% ${day.band}`
                      : 'nothing left to score'
                }`}
              />
            ))}
          </div>

          {weekdays ? (
            <div className="mt-1 flex gap-0.5">
              {cells.map((day) => (
                <span
                  key={day.date}
                  className="flex-1 text-center font-mono text-[10px] text-muted"
                >
                  {weekdayLetter(day.date)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : total > 0 ? (
        <div className="mt-2.5 flex h-1.5 w-full gap-px">
          {counts.map((cell) =>
            cell.count === 0 ? null : (
              <div
                key={cell.band}
                className={TONE[cell.band]}
                style={{ width: `${(cell.count / total) * 100}%` }}
              />
            ),
          )}
        </div>
      ) : null}

      {shape.warning ? <p className="mt-2.5 text-xs text-fail">{shape.warning}</p> : null}
    </section>
  );
}
