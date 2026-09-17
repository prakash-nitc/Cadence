/**
 * Focus charts — SPEC §4.4.
 *
 * Time per day as columns, a pattern across the week or the day as a line with its peak
 * marked, and the split by area as a ring. Hand-drawn like the rest (CLAUDE.md rule 5), and
 * pure presentation: every number arrives computed by `engine/focus`.
 *
 * Kept apart from Charts.tsx because these read minutes, not percentages, and all share
 * one axis treatment.
 */
import { formatDuration } from '../../lib/time';

/** A round axis ceiling in minutes: whole hours above one hour, 15-minute steps below. */
function niceCeiling(max: number): number {
  if (max <= 0) return 60;
  if (max <= 60) return Math.ceil(max / 15) * 15;
  return Math.ceil(max / 60) * 60;
}

const axisLabel = (minutes: number): string => (minutes === 0 ? '0' : formatDuration(minutes));

function Axis({ ceiling, height }: { ceiling: number; height: number }) {
  return (
    <div
      className="relative w-12 shrink-0 font-mono text-[10px] text-muted"
      style={{ height }}
      aria-hidden
    >
      {[1, 0.5, 0].map((at) => (
        <span
          key={at}
          className="absolute right-2 -translate-y-1/2"
          style={{ top: `${(1 - at) * 100}%` }}
        >
          {axisLabel(Math.round(ceiling * at))}
        </span>
      ))}
    </div>
  );
}

function Rules() {
  return (
    <>
      {[0, 0.5, 1].map((at) => (
        <span
          key={at}
          className="absolute inset-x-0 border-t border-edge"
          style={{ top: `${at * 100}%` }}
          aria-hidden
        />
      ))}
    </>
  );
}

/**
 * Minutes per day across a range.
 *
 * A zero day is a short dash on the baseline, so an empty day reads as a day rather than a
 * gap; a day still to come draws nothing at all.
 */
export function ColumnChart({
  points,
  height = 170,
  labelEvery = 7,
}: {
  points: { label: string; title: string; minutes: number | null }[];
  height?: number;
  labelEvery?: number;
}) {
  const ceiling = niceCeiling(Math.max(0, ...points.map((point) => point.minutes ?? 0)));

  return (
    <div data-chart="columns">
      <div className="flex">
        <Axis ceiling={ceiling} height={height} />
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <Rules />
          <div className="absolute inset-0 flex items-end gap-[3px]">
            {points.map((point, index) => (
              <div
                key={index}
                className="flex h-full min-w-0 flex-1 items-end justify-center"
                title={
                  point.minutes === null
                    ? `${point.title} — still to come`
                    : `${point.title} — ${formatDuration(point.minutes)}`
                }
              >
                {point.minutes === null ? null : point.minutes === 0 ? (
                  <span className="mb-px h-[3px] w-full max-w-[10px] rounded-full bg-edge" />
                ) : (
                  <span
                    className="w-full max-w-[14px] rounded-t-[3px] bg-signal/80"
                    style={{ height: `${Math.max(2, (point.minutes / ceiling) * 100)}%` }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-12 mt-2 flex gap-[3px] font-mono text-[10px] text-muted">
        {points.map((point, index) => (
          <span key={index} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {index % labelEvery === 0 ||
            // The last day gets a label only if it is not crowding the previous one.
            (index === points.length - 1 && index % labelEvery >= Math.ceil(labelEvery / 2))
              ? point.label
              : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A pattern — the week, the day — with its peak marked.
 *
 * Missing points break the line: a weekday with no started days is unknown, not zero.
 */
export function PeakChart({
  points,
  peak,
  height = 150,
}: {
  points: { label: string; title: string; minutes: number | null }[];
  peak: number | null;
  height?: number;
}) {
  const ceiling = niceCeiling(Math.max(0, ...points.map((point) => point.minutes ?? 0)));
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const y = (minutes: number): number => (1 - Math.min(1, minutes / ceiling)) * 100;

  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.minutes === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${(index * step).toFixed(2)},${y(point.minutes).toFixed(2)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  const peakPoint = peak === null ? null : points[peak];

  return (
    <div data-chart="peak">
      <div className="flex">
        <Axis ceiling={ceiling} height={height} />
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <Rules />
          {peak !== null && peakPoint?.minutes != null ? (
            <span
              className="absolute inset-y-0 border-l border-dashed border-muted/60"
              style={{ left: `${peak * step}%` }}
              aria-hidden
            />
          ) : null}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            {segments.map((path, index) => (
              <path
                key={index}
                d={path}
                fill="none"
                className="stroke-signal"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {points.map((point, index) =>
            point.minutes === null ? null : (
              <span
                key={index}
                title={`${point.title} — ${formatDuration(point.minutes)}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  index === peak
                    ? 'h-3 w-3 border-2 border-signal bg-panel'
                    : 'h-1.5 w-1.5 bg-signal/70'
                }`}
                style={{ left: `${index * step}%`, top: `${y(point.minutes)}%` }}
              />
            ),
          )}
        </div>
      </div>
      <div className="relative ml-12 mt-2 h-4 font-mono text-[10px] text-muted">
        {points.map((point, index) =>
          point.label ? (
            <span
              key={index}
              className={`absolute whitespace-nowrap ${
                index === 0 ? '' : index === points.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
              } ${index === peak ? 'font-semibold text-text' : ''}`}
              style={{ left: `${index * step}%` }}
            >
              {point.label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/**
 * Categorical tones for the area split. The only place the app needs colours that mean
 * "a different thing" rather than a state — SPEC §8 — so they never reuse the band colours.
 * Anything folded ("Other", "Untagged") is neutral.
 */
const SLICE_STROKE = ['stroke-cat1', 'stroke-cat2', 'stroke-cat3', 'stroke-cat4', 'stroke-cat5'];
const SLICE_DOT = ['bg-cat1', 'bg-cat2', 'bg-cat3', 'bg-cat4', 'bg-cat5'];
const isNeutral = (label: string): boolean => label === 'Other' || label === 'Untagged';

export function Ring({
  slices,
}: {
  slices: { label: string; minutes: number; share: number }[];
}) {
  const total = slices.reduce((sum, slice) => sum + slice.minutes, 0);
  let colour = 0;
  const toned = slices.map((slice) => ({
    ...slice,
    stroke: isNeutral(slice.label) ? 'stroke-muted/60' : (SLICE_STROKE[colour] ?? 'stroke-muted'),
    dot: isNeutral(slice.label) ? 'bg-muted/60' : (SLICE_DOT[colour++] ?? 'bg-muted'),
  }));

  // Circumference 100, so a slice's dash length is its share of the total.
  const radius = 15.9155;
  let offset = 25;

  return (
    <div className="flex flex-wrap items-center gap-8" data-chart="ring">
      <svg viewBox="0 0 42 42" className="h-44 w-44 shrink-0 -rotate-0" aria-hidden>
        <circle cx="21" cy="21" r={radius} fill="none" className="stroke-sunk" strokeWidth="6" />
        {toned.map((slice) => {
          const length = total === 0 ? 0 : (slice.minutes / total) * 100;
          const dash = (
            <circle
              key={slice.label}
              cx="21"
              cy="21"
              r={radius}
              fill="none"
              className={slice.stroke}
              strokeWidth="6"
              strokeDasharray={`${Math.max(0, length - 0.6)} ${100 - Math.max(0, length - 0.6)}`}
              strokeDashoffset={offset}
            />
          );
          offset -= length;
          return dash;
        })}
        <text
          x="21"
          y="20.5"
          textAnchor="middle"
          className="fill-text font-mono"
          style={{ fontSize: '4.2px', fontWeight: 600 }}
        >
          {formatDuration(total)}
        </text>
        <text x="21" y="25.5" textAnchor="middle" className="fill-muted" style={{ fontSize: '2.6px' }}>
          focused
        </text>
      </svg>

      <ul className="min-w-[14rem] flex-1 divide-y divide-edge">
        {toned.map((slice) => (
          <li key={slice.label} className="flex items-center gap-3 py-2 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${slice.dot}`} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-text">{slice.label}</span>
            <span className="w-12 text-right font-mono text-xs text-soft">{slice.share}%</span>
            <span className="w-20 text-right font-mono text-xs text-muted">
              {formatDuration(slice.minutes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
