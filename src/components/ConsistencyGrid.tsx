import type { DayBand } from '../engine/pacing';

/**
 * The consistency grid — SPEC §4.5. One cell per day, coloured by band.
 *
 * A recovery day is a hollow outline and a placement-mode day is marked distinctly:
 * a day spent in an interview is not a lapse in discipline and must not render as one.
 *
 * There is no streak counter, deliberately. Streaks create an incentive to lie to the
 * tracker, which destroys the only thing a tracker is for.
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

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T12:00:00`);
  for (let at = Date.parse(`${from}T12:00:00`); at <= end; at += 86_400_000) {
    out.push(new Date(at).toISOString().slice(0, 10));
  }
  return out;
}

export function ConsistencyGrid({ bands, from, to }: ConsistencyGridProps) {
  const byDate = new Map(bands.map((entry) => [entry.date, entry]));
  const dates = eachDay(from, to);

  // Pad the front so every column is one week, starting Monday.
  const firstDay = new Date(`${dates[0] ?? from}T12:00:00`).getDay();
  const padding = (firstDay + 6) % 7;

  return (
    <div>
      <div
        className="grid grid-flow-col gap-0.5 overflow-x-auto"
        style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
      >
        {Array.from({ length: padding }, (_, index) => (
          <div key={`pad-${index}`} className="h-3 w-3" />
        ))}

        {dates.map((date) => {
          const entry = byDate.get(date);

          if (!entry) {
            return <div key={date} className="h-3 w-3 bg-panel" title={`${date} — no record`} />;
          }

          const recovery = entry.template === 'recovery';
          const tone = entry.band ? BAND_TONE[entry.band] : 'bg-panel';

          return (
            <div
              key={date}
              title={`${date} — ${
                entry.band
                  ? `${entry.score ?? '—'}% ${entry.band}`
                  : entry.planned
                    ? 'displaced'
                    : 'not planned'
              }${recovery ? ' · recovery' : ''}${entry.placementMode ? ' · placement' : ''}`}
              className={`h-3 w-3 ${
                recovery
                  ? `border ${entry.band === 'green' ? 'border-pass' : entry.band === 'yellow' ? 'border-warn' : entry.band === 'red' ? 'border-fail' : 'border-edge'}`
                  : tone
              } ${entry.placementMode ? 'ring-1 ring-inset ring-signal' : ''}`}
            />
          );
        })}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {[
          { tone: 'bg-pass', label: 'green' },
          { tone: 'bg-warn', label: 'yellow' },
          { tone: 'bg-fail', label: 'red' },
          { tone: 'bg-panel', label: 'no record' },
          { tone: 'border border-edge', label: 'recovery' },
          { tone: 'ring-1 ring-inset ring-signal', label: 'placement' },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 ${item.tone}`} aria-hidden />
            {item.label}
          </span>
        ))}
      </dl>
    </div>
  );
}
