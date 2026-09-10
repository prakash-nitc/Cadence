import type { DayBand } from '../engine/pacing';
import { dateKey } from '../lib/time';

/**
 * The consistency grid — SPEC §4.5. One cell per day, coloured by the band it scored.
 *
 * Weeks run down the columns, Monday at the top, so a run of bad Thursdays reads as a
 * row. Weekday and month labels are the whole point: without them the grid is a pattern
 * with no way to say *when*, and the only question worth asking of it is when.
 *
 * A recovery day is a hollow outline and a placement-mode day carries a ring: a day spent
 * in an interview is not a lapse in discipline and must not render as one.
 *
 * Sits beside the activity heatmap and deliberately matches its cell size and radius —
 * they measure different things (band against work done) and should read as one family.
 */
interface ConsistencyGridProps {
  bands: DayBand[];
  /** Inclusive date range to render, so untouched days show as untouched. */
  from: string;
  to: string;
}

const BAND_TONE: Record<string, string> = {
  green: 'bg-pass',
  yellow: 'bg-warn',
  red: 'bg-fail',
};

const BAND_EDGE: Record<string, string> = {
  green: 'border-pass',
  yellow: 'border-warn',
  red: 'border-fail',
};

/** Monday first, and only alternate rows labelled — seven labels is a wall of letters. */
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T12:00:00`);
  // `dateKey` is local; toISOString is UTC, and mixing them shifts the date by one for
  // anyone far enough from Greenwich.
  for (let at = Date.parse(`${from}T12:00:00`); at <= end; at += 86_400_000) {
    out.push(dateKey(at));
  }
  return out;
}

export function ConsistencyGrid({ bands, from, to }: ConsistencyGridProps) {
  const byDate = new Map(bands.map((entry) => [entry.date, entry]));
  const dates = eachDay(from, to);

  // Pad the front so every column is one week, starting Monday.
  const first = dates[0] ?? from;
  const padding = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(padding).fill(null), ...dates];

  const columns: (string | null)[][] = [];
  for (let at = 0; at < cells.length; at += 7) columns.push(cells.slice(at, at + 7));

  /** A month name over the column where that month first appears. */
  const monthLabel = (column: (string | null)[], index: number): string => {
    const date = column.find((entry): entry is string => entry !== null);
    if (!date) return '';
    const month = date.slice(0, 7);
    const before = columns[index - 1]?.find((entry): entry is string => entry !== null);
    if (before && before.slice(0, 7) === month) return '';
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' });
  };

  const describe = (date: string): string => {
    const entry = byDate.get(date);
    if (!entry) return `${date} — no record`;

    const what = entry.band
      ? `${entry.score ?? '—'}% ${entry.band}`
      : entry.planned
        ? 'planned, not scored'
        : 'not planned';

    return `${date} — ${what}${entry.template === 'recovery' ? ' · recovery' : ''}${
      entry.placementMode ? ' · placement' : ''
    }`;
  };

  return (
    /* A stable hook: the activity heatmap beside this one has date-titled cells too, and
       telling them apart by element type is exactly the coupling that keeps breaking. */
    <div data-grid="bands">
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1">
          {/* The gutter: weekday labels, aligned to the rows they name. */}
          <div className="flex shrink-0 flex-col gap-1 pr-1 pt-[18px]">
            {WEEKDAYS.map((label, row) => (
              <span
                key={row}
                className="flex h-3 items-center text-[10px] leading-none text-muted"
              >
                {label}
              </span>
            ))}
          </div>

          {columns.map((column, index) => (
            <div key={index} className="flex shrink-0 flex-col gap-1">
              <span className="h-[14px] font-mono text-[10px] leading-none text-muted">
                {monthLabel(column, index)}
              </span>

              {Array.from({ length: 7 }, (_, row) => {
                const date = column[row];
                if (!date) return <span key={row} className="h-3 w-3" />;

                const entry = byDate.get(date);
                const recovery = entry?.template === 'recovery';
                const band = entry?.band ?? null;

                return (
                  <span
                    key={date}
                    title={describe(date)}
                    className={`h-3 w-3 rounded-[3px] ${
                      recovery
                        ? `border ${band ? BAND_EDGE[band] : 'border-edge'}`
                        : band
                          ? BAND_TONE[band]
                          : entry
                            ? 'border border-edge bg-panel'
                            : 'bg-sunk'
                    } ${entry?.placementMode ? 'ring-1 ring-inset ring-signal' : ''}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {[
          { tone: 'bg-pass', label: 'green' },
          { tone: 'bg-warn', label: 'yellow' },
          { tone: 'bg-fail', label: 'red' },
          { tone: 'border border-edge bg-panel', label: 'not scored' },
          { tone: 'bg-sunk', label: 'no record' },
          { tone: 'border border-edge', label: 'recovery' },
          { tone: 'ring-1 ring-inset ring-signal bg-sunk', label: 'placement' },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-[3px] ${item.tone}`} aria-hidden />
            {item.label}
          </span>
        ))}
      </dl>
    </div>
  );
}
