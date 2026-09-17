/**
 * Focus, for a month — SPEC §4.4.
 *
 * Four questions, each with its answer said first and the chart underneath: how much, which
 * day of the week, which hour of the day, and on what. Every figure comes from
 * `engine/focus`, and each chart says what it rests on where that is not obvious.
 */
import { COMMITMENT_PRESETS, FOCUS_AREAS } from '../../config/schedule.config';
import { focusSummary, peakIndex } from '../../engine/focus';
import type { Period } from '../../engine/pacing';
import { formatDuration } from '../../lib/time';
import { ColumnChart, PeakChart, Ring } from '../charts/FocusCharts';
import { Panel } from '../ui/primitives';

/** Which tags each block's preset carries, so untagged work inherits its block's area. */
const BLOCK_TAGS: Record<string, string[]> = Object.fromEntries(
  COMMITMENT_PRESETS.map((preset) => [preset.blockId, preset.tags]),
);

const WEEKDAY_NAMES: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

function Answer({ lead, value, rest }: { lead: string; value: string; rest?: string }) {
  return (
    <p className="mb-4 text-sm text-soft">
      {lead} <span className="font-mono font-semibold text-deep">{value}</span>
      {rest ? ` ${rest}` : null}
    </p>
  );
}

export function FocusPanels({
  period,
  from,
  to,
  today,
}: {
  period: Period;
  from: string;
  to: string;
  today: string;
}) {
  const focus = focusSummary(period, from, to, today, FOCUS_AREAS, BLOCK_TAGS);

  if (focus.totalMinutes === 0) {
    return (
      <Panel title="Focus" icon="clock">
        <p className="text-sm text-muted" data-focus-empty>
          No focused time this month yet. It fills in as commitments get done and work blocks
          get closed with the time you worked.
        </p>
      </Panel>
    );
  }

  const weekdayPeak = peakIndex(focus.byWeekday.map((entry) => entry.average));
  const hourPeak = peakIndex(focus.byHour);
  const bestDay = weekdayPeak === null ? null : focus.byWeekday[weekdayPeak];

  return (
    <section className="space-y-5" data-focus>
      <Panel title="Focused time" icon="clock">
        <Answer lead="Total focused time:" value={formatDuration(focus.totalMinutes)} />
        <ColumnChart
          points={focus.byDay.map((entry) => {
            const at = new Date(`${entry.date}T12:00:00`);
            return {
              label: `${at.getDate()}/${at.getMonth() + 1}`,
              title: at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
              minutes: entry.minutes,
            };
          })}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Most focused day of the week" icon="calendar">
          {bestDay ? (
            <Answer
              lead="Most focused on"
              value={bestDay.day}
              rest={`— ${formatDuration(bestDay.average ?? 0)} on an average ${WEEKDAY_NAMES[bestDay.day] ?? bestDay.day}.`}
            />
          ) : (
            <Answer lead="Not enough started days yet to" value="compare" />
          )}
          <PeakChart
            peak={weekdayPeak}
            points={focus.byWeekday.map((entry) => ({
              label: entry.day,
              title: `${WEEKDAY_NAMES[entry.day] ?? entry.day}, average over ${entry.days} ${entry.days === 1 ? 'day' : 'days'}`,
              minutes: entry.average,
            }))}
          />
          <p className="mt-3 text-xs text-muted">
            Average per started day. A day never started is left out, not counted as zero.
          </p>
        </Panel>

        <Panel title="Most focused period of the day" icon="clock">
          {hourPeak !== null ? (
            <Answer lead="Most focused at" value={hourLabel(hourPeak)} rest="across the month." />
          ) : (
            <Answer lead="No focused time placed in the day" value="yet" />
          )}
          <PeakChart
            peak={hourPeak}
            points={focus.byHour.map((minutes, hour) => ({
              label: hour % 6 === 0 || hour === 23 ? hourLabel(hour) : '',
              title: `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`,
              minutes,
            }))}
          />
          <p className="mt-3 text-xs text-muted">
            Each block&apos;s time is spread across its scheduled hours.
            {focus.unplacedMinutes > 0
              ? ` ${formatDuration(focus.unplacedMinutes)} had no block and is not placed.`
              : ''}
          </p>
        </Panel>
      </div>

      <Panel title="Where the time went" icon="chart">
        <Ring slices={focus.areas} />
        <p className="mt-4 text-xs text-muted">
          Every minute is counted once, under the first area its tags name. Untagged work takes
          its block&apos;s area.
        </p>
      </Panel>
    </section>
  );
}
