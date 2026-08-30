/**
 * The charts — §26, §28, §29 of the redesign brief.
 *
 * Hand-drawn SVG rather than a charting library, for the reason in CLAUDE.md rule 5 and
 * because these three are simple and the defaults of a general chart library would all
 * need overriding anyway. No gridlines, no legends, no axis furniture: the data is the
 * decoration.
 *
 * Pure presentation. Everything here takes numbers already computed by `engine/pacing`
 * and never derives a statistic of its own — §37 is explicit that analytics must come
 * from stored data, and a chart that computes its own is a chart that can disagree with
 * the number beside it.
 */
import { Icon } from '../ui/Icon';

export interface SeriesPoint {
  label: string;
  /** Null where there is no data for that slot — an unlogged day, not a zero. */
  value: number | null;
  /** Optional detail line for the hover title. */
  detail?: string;
}

/**
 * Completion across a week — §26.
 *
 * Unlogged days break the line rather than dropping it to zero. A day you did not log is
 * an absence of data; drawing it as 0% would be the app inventing a bad day.
 */
export function LineChart({
  points,
  height = 148,
  max = 100,
  suffix = '%',
}: {
  points: SeriesPoint[];
  height?: number;
  max?: number;
  suffix?: string;
}) {
  const width = 100;
  const top = 6;
  const usable = height - top - 22;
  const step = points.length > 1 ? width / (points.length - 1) : 0;

  const xy = points.map((point, index) => ({
    ...point,
    x: index * step,
    y: point.value === null ? null : top + usable * (1 - Math.min(1, point.value / max)),
  }));

  // Break the path wherever data is missing, so a gap reads as a gap.
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of xy) {
    if (point.y === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      continue;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  }
  if (current.length > 1) segments.push(current.join(' '));

  const plotted = xy.filter((point) => point.y !== null);
  const anyData = plotted.length > 0;

  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* Quartile rules, drawn behind and barely there. */}
        <div className="absolute inset-x-0" style={{ top, height: usable }}>
          {[0, 0.5, 1].map((at) => (
            <span
              key={at}
              className="absolute inset-x-0 border-t border-edge"
              style={{ top: `${at * 100}%` }}
            />
          ))}
        </div>

        {anyData ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {segments.map((path) => (
              <path
                key={path}
                d={path}
                fill="none"
                className="stroke-signal"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        ) : null}

        {/* Points sit in HTML so they stay circular under the non-uniform viewBox. */}
        {plotted.map((point) => (
          <span
            key={point.label}
            title={`${point.label} — ${point.value}${suffix}${point.detail ? ` · ${point.detail}` : ''}`}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-signal bg-panel"
            style={{ left: `${point.x}%`, top: `${point.y}px` }}
          />
        ))}

        <div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[11px] text-muted">
          {points.map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
      </div>

      {!anyData ? (
        <p className="mt-2 text-xs text-muted">Nothing logged in this range yet.</p>
      ) : null}
    </div>
  );
}

/** Focused work per day — §29. Horizontal, so long labels have somewhere to go. */
export function BarChart({
  points,
  unit = 'h',
}: {
  points: SeriesPoint[];
  unit?: string;
}) {
  const peak = Math.max(1, ...points.map((point) => point.value ?? 0));

  return (
    <div className="space-y-2">
      {points.map((point) => {
        const value = point.value ?? 0;
        return (
          <div key={point.label} className="flex items-center gap-3">
            <span className="w-10 shrink-0 font-mono text-[11px] text-muted">{point.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-sunk">
              <div
                className="h-full rounded-sm bg-signal/80 transition-[width] duration-500"
                style={{ width: `${(value / peak) * 100}%` }}
                title={`${point.label} — ${value.toFixed(1)}${unit}`}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-[11px] text-soft">
              {point.value === null ? '—' : `${value.toFixed(1)}${unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface HeatCell {
  date: string;
  /** 0–1 intensity, or null for a day with nothing logged. */
  intensity: number | null;
  title: string;
}

/**
 * The activity heatmap — §28. Five steps of green, weeks as columns.
 *
 * Deliberately not a streak: it shows how much work landed, with no counter that resets
 * and nothing that punishes a single missed day. A quiet week reads as a quiet week.
 */
export function Heatmap({ cells, weeks = 18 }: { cells: HeatCell[]; weeks?: number }) {
  const shown = cells.slice(-weeks * 7);

  // Pad the front so the first column starts on a Monday.
  const first = shown[0];
  const lead = first ? (new Date(`${first.date}T12:00:00`).getDay() + 6) % 7 : 0;
  const padded: (HeatCell | null)[] = [...Array<null>(lead).fill(null), ...shown];

  const columns: (HeatCell | null)[][] = [];
  for (let at = 0; at < padded.length; at += 7) columns.push(padded.slice(at, at + 7));

  const step = (intensity: number | null): string => {
    if (intensity === null) return 'bg-sunk';
    if (intensity <= 0) return 'bg-sunk';
    if (intensity < 0.3) return 'bg-wash';
    if (intensity < 0.55) return 'bg-mint/50';
    if (intensity < 0.8) return 'bg-mint';
    return 'bg-deep';
  };

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {columns.map((column, index) => (
          <div key={index} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, row) => {
              const cell = column[row];
              return cell ? (
                <span
                  key={cell.date}
                  title={cell.title}
                  className={`h-3 w-3 rounded-[3px] ${step(cell.intensity)}`}
                />
              ) : (
                <span key={`${index}-${row}`} className="h-3 w-3" />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
        <span>Less</span>
        {['bg-sunk', 'bg-wash', 'bg-mint/50', 'bg-mint', 'bg-deep'].map((tone) => (
          <span key={tone} className={`h-3 w-3 rounded-[3px] ${tone}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

/**
 * A month grid coloured by each day's band — the calendar widget.
 *
 * Not a calendar integration (§10 still rules that out) and nothing is scheduled here.
 * It is the history grid arranged the way a month is actually thought about, so "I lost
 * the second week of September" is a shape rather than a search.
 */
export interface CalendarDay {
  date: string;
  tone: 'pass' | 'warn' | 'fail' | null;
  title: string;
}

const CALENDAR_TONE: Record<'pass' | 'warn' | 'fail', string> = {
  pass: 'bg-pass/85 text-panel',
  warn: 'bg-warn/85 text-panel',
  fail: 'bg-fail/80 text-panel',
};

export function MonthCalendar({
  month,
  days,
  onPrev,
  onNext,
  onPick,
  selected,
}: {
  /** 'YYYY-MM'. */
  month: string;
  days: CalendarDay[];
  onPrev?: () => void;
  onNext?: () => void;
  onPick?: (date: string) => void;
  selected?: string | null;
}) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const first = new Date(`${month}-01T12:00:00`);
  const lead = (first.getDay() + 6) % 7;
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

  const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            aria-label="Previous month"
            className="rounded-sm p-1 text-muted transition-colors hover:bg-sunk hover:text-text disabled:opacity-40"
          >
            <Icon name="chevronLeft" size={15} />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            aria-label="Next month"
            className="rounded-sm p-1 text-muted transition-colors hover:bg-sunk hover:text-text disabled:opacity-40"
          >
            <Icon name="chevronRight" size={15} />
          </button>
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
          <span
            key={`${day}-${index}`}
            className="pb-1 text-center text-[11px] font-medium text-muted"
          >
            {day}
          </span>
        ))}

        {Array.from({ length: lead }, (_, index) => (
          <span key={`lead-${index}`} />
        ))}

        {Array.from({ length }, (_, index) => {
          const date = `${month}-${String(index + 1).padStart(2, '0')}`;
          const day = byDate.get(date);
          const tone = day?.tone ?? null;
          const isSelected = selected === date;

          return (
            <button
              key={date}
              type="button"
              onClick={onPick ? () => onPick(date) : undefined}
              disabled={!onPick}
              title={day?.title ?? date}
              className={`flex aspect-square items-center justify-center rounded-sm font-mono text-xs transition-colors ${
                tone ? CALENDAR_TONE[tone] : 'bg-sunk text-muted'
              } ${isSelected ? 'ring-2 ring-text ring-offset-1 ring-offset-panel' : ''} ${
                onPick ? 'hover:opacity-80' : ''
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
