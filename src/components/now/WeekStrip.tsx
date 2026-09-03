/**
 * This week, on Now — SPEC §8's hierarchy, level four.
 *
 * Deliberately small and deliberately last in the summary column. "Am I being consistent"
 * is a real question, but it is not today's question, and a week view that competed with
 * the running block would answer the wrong one.
 *
 * Reads the same bands Progress does, so a cell here and a cell there can never disagree.
 */
import type { DayBand } from '../../engine/pacing';
import { dateKey } from '../../lib/time';
import { Icon } from '../ui/Icon';
import type { Tone } from '../ui/primitives';

const CELL: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-pass/85 text-panel',
  yellow: 'bg-warn/85 text-panel',
  red: 'bg-fail/80 text-panel',
};

const LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function WeekStrip({
  bands,
  today,
  minGreen,
}: {
  bands: DayBand[];
  /** 'YYYY-MM-DD'. Marked, and never coloured as a verdict on a day still running. */
  today: string;
  minGreen: number;
}) {
  const byDate = new Map(bands.map((band) => [band.date, band]));

  const monday = new Date(`${today}T12:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const week = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(monday);
    at.setDate(monday.getDate() + index);
    const date = dateKey(at);
    return { date, band: byDate.get(date) ?? null, isToday: date === today, ahead: date > today };
  });

  const green = week.filter((day) => day.band?.band === 'green').length;
  const scored = week.filter((day) => day.band?.band != null).length;
  const tone: Tone = green >= minGreen ? 'pass' : 'neutral';

  return (
    <section className="card p-5">
      <p className="eyebrow">This week</p>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {week.map((day, index) => {
          const band = day.band?.band ?? null;
          const placement = day.band?.placementMode ?? false;

          return (
            <div key={day.date} className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-muted">{LETTER[index]}</span>
              <span
                title={
                  day.ahead
                    ? `${day.date} — still to come`
                    : `${day.date} — ${day.band?.score === null || !day.band ? 'not scored' : `${day.band.score}%`}${placement ? ' · placement day' : ''}`
                }
                className={`flex h-8 w-full items-center justify-center rounded-sm text-[11px] font-medium transition-colors ${
                  band ? CELL[band] : day.ahead ? 'bg-sunk/60 text-muted' : 'bg-sunk text-muted'
                } ${day.isToday ? 'ring-2 ring-text ring-offset-1 ring-offset-panel' : ''}`}
              >
                {placement ? <Icon name="flag" size={12} /> : day.band?.score ?? ''}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-edge pt-3 text-xs text-muted">
        {scored === 0 ? (
          'Nothing scored yet this week.'
        ) : (
          <>
            <span className={tone === 'pass' ? 'font-medium text-deep' : 'font-medium text-text'}>
              {green} green
            </span>{' '}
            of {scored} scored, against a shape of {minGreen}.
          </>
        )}
      </p>
    </section>
  );
}
