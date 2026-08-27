import { useEffect, useMemo, useState } from 'react';
import { FULL_DAY, MILESTONES, WEEKLY_TARGETS } from '../config/schedule.config';
import { ConsistencyGrid } from '../components/ConsistencyGrid';
import { MilestoneRow } from '../components/MilestoneRow';
import { TargetBar } from '../components/TargetBar';
import { WeekShape } from '../components/WeekShape';
import { committableMinutes } from '../engine/feasibility';
import {
  bandDays,
  milestoneStatuses,
  tagTotals,
  tallies,
  weeklyPacing,
  weekShape,
  type Period,
} from '../engine/pacing';
import type { Prefs } from '../lib/prefs';
import { addDays, dateKey } from '../lib/time';
import { useDay } from '../store/dayStore';
import { GRID_DAYS, useProgress } from '../store/progressStore';

/**
 * Progress — SPEC §4.3–§4.5. Read-only, three horizons, all fed from daily commitments.
 *
 * Nothing here is logged twice: the week, the month and the grid are three views of the
 * same records.
 */
type Horizon = 'Week' | 'Month' | 'History';

const HORIZONS: Horizon[] = ['Week', 'Month', 'History'];

/** Monday-start weeks: the Sunday review closes a week rather than opening one. */
function startOfWeek(date: string): string {
  const at = new Date(`${date}T12:00:00`);
  return dateKey(addDays(at, -((at.getDay() + 6) % 7)));
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function endOfMonth(date: string): string {
  const at = new Date(`${date.slice(0, 7)}-01T12:00:00`);
  return dateKey(addDays(new Date(at.getFullYear(), at.getMonth() + 1, 1, 12), -1));
}

const slice = (period: Period, from: string, to: string): Period => ({
  days: period.days.filter((day) => day.date >= from && day.date <= to),
  commitments: period.commitments.filter(
    (commitment) => commitment.dayDate >= from && commitment.dayDate <= to,
  ),
  logs: period.logs.filter((log) => log.date >= from && log.date <= to),
});

export function Progress({ prefs }: { prefs: Prefs }) {
  const { date } = useDay();
  const { loaded, days, commitments, logs, milestoneProgress, load, toggleChecklistItem, toggleDone } =
    useProgress();
  const [horizon, setHorizon] = useState<Horizon>('Week');

  useEffect(() => {
    if (date) void load(date);
  }, [date, load]);

  const period = useMemo<Period>(() => ({ days, commitments, logs }), [days, commitments, logs]);

  if (!date || !loaded) return <p className="text-sm text-muted">Loading.</p>;

  const weekFrom = startOfWeek(date);
  const weekTo = dateKey(addDays(new Date(`${weekFrom}T12:00:00`), 6));
  const daysLeftInWeek = Math.max(
    0,
    Math.round((Date.parse(`${weekTo}T12:00:00`) - Date.parse(`${date}T12:00:00`)) / 86_400_000) + 1,
  );

  const dailyCapacityHours = committableMinutes(FULL_DAY) / 60;

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl tracking-display text-text">Progress</h1>
        <div className="flex gap-px">
          {HORIZONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setHorizon(option)}
              className={`border px-2.5 py-1 text-xs ${
                horizon === option ? 'border-signal text-signal' : 'border-edge text-muted'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      {horizon === 'Week' ? (
        <WeekView
          period={slice(period, weekFrom, weekTo)}
          prefs={prefs}
          daysLeft={daysLeftInWeek}
          capacity={dailyCapacityHours}
          label={`Week of ${weekFrom}`}
        />
      ) : null}

      {horizon === 'Month' ? (
        <MonthView period={period} prefs={prefs} date={date} />
      ) : null}

      {horizon === 'History' ? (
        <HistoryView
          period={period}
          prefs={prefs}
          from={dateKey(addDays(new Date(`${date}T12:00:00`), -GRID_DAYS))}
          to={date}
          progress={milestoneProgress}
          asOf={date}
          onToggleItem={(key, item) => void toggleChecklistItem(key, item)}
          onToggleDone={(key) => void toggleDone(key, Date.now())}
        />
      ) : null}
    </div>
  );
}

function Tallies({ period }: { period: Period }) {
  const t = tallies(period);
  const cells = [
    { label: 'Contained', value: t.containedPercent === null ? '—' : `${t.containedPercent}%` },
    { label: 'Pushes', value: String(t.pushes) },
    { label: 'Avoided', value: String(t.avoided) },
    { label: 'Energy', value: t.energy === null ? '—' : String(t.energy) },
  ];

  return (
    <div>
      <dl className="grid grid-cols-4 gap-px border border-edge bg-edge">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-panel px-2 py-2">
            <dt className="text-xs text-muted">{cell.label}</dt>
            <dd className="font-mono text-sm text-text">{cell.value}</dd>
          </div>
        ))}
      </dl>

      {t.energyTrend.length > 1 ? (
        <div className="mt-2 flex h-6 items-end gap-0.5">
          {t.energyTrend.map((value, index) => (
            <div
              key={index}
              className="flex-1 bg-muted/40"
              style={{ height: `${(value / 5) * 100}%` }}
              title={`Energy ${value}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WeekView({
  period,
  prefs,
  daysLeft,
  capacity,
  label,
}: {
  period: Period;
  prefs: Prefs;
  daysLeft: number;
  capacity: number;
  label: string;
}) {
  const bands = bandDays(period, prefs);
  const shape = weekShape(bands, prefs);
  const paces = weeklyPacing(period, WEEKLY_TARGETS, daysLeft, capacity);

  return (
    <div className="space-y-5">
      <WeekShape shape={shape} label={label} />

      <section>
        <h2 className="mb-1.5 text-xs uppercase tracking-block text-muted">Targets</h2>
        <div className="border border-edge bg-panel">
          {paces.map((pace) => (
            <TargetBar key={pace.id} pace={pace} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1.5 text-xs uppercase tracking-block text-muted">This week</h2>
        <Tallies period={period} />
      </section>
    </div>
  );
}

function MonthView({ period, prefs, date }: { period: Period; prefs: Prefs; date: string }) {
  const from = startOfMonth(date);
  const to = endOfMonth(date);
  const thisMonth = slice(period, from, to);

  const previousEnd = dateKey(addDays(new Date(`${from}T12:00:00`), -1));
  const previousStart = startOfMonth(previousEnd);
  const lastMonth = slice(period, previousStart, previousEnd);

  const shape = weekShape(bandDays(thisMonth, prefs), prefs);
  const previousShape = weekShape(bandDays(lastMonth, prefs), prefs);
  const totals = tagTotals(thisMonth);

  const delta = shape.green - previousShape.green;

  return (
    <div className="space-y-5">
      <WeekShape shape={shape} label={`Month of ${from.slice(0, 7)}`} />

      <section className="border border-edge bg-panel px-3 py-2">
        <p className="text-xs uppercase tracking-block text-muted">Against last month</p>
        <p className="mt-1 font-mono text-sm text-text">
          {previousShape.green + previousShape.yellow + previousShape.red === 0 ? (
            <span className="text-muted">No month to compare against yet.</span>
          ) : (
            <>
              {delta >= 0 ? '+' : ''}
              {delta} green
              <span className="ml-2 text-muted">
                ({previousShape.green} → {shape.green})
              </span>
            </>
          )}
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 text-xs uppercase tracking-block text-muted">Where the time went</h2>
        {totals.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged this month.</p>
        ) : (
          <div className="border border-edge bg-panel">
            {totals.map((entry) => (
              <div
                key={entry.tag}
                className="flex items-baseline justify-between border-b border-edge px-3 py-2 last:border-b-0"
              >
                <span className="text-sm text-text">{entry.tag}</span>
                <span className="font-mono text-xs text-muted">
                  {Math.round((entry.minutes / 60) * 10) / 10} hrs
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1.5 text-xs uppercase tracking-block text-muted">This month</h2>
        <Tallies period={thisMonth} />
      </section>
    </div>
  );
}

function HistoryView({
  period,
  prefs,
  from,
  to,
  progress,
  asOf,
  onToggleItem,
  onToggleDone,
}: {
  period: Period;
  prefs: Prefs;
  from: string;
  to: string;
  progress: Map<string, { checked: string[]; doneAt: number | null }>;
  asOf: string;
  onToggleItem: (key: string, item: string) => void;
  onToggleDone: (key: string) => void;
}) {
  const bands = bandDays(period, prefs);
  const milestones = milestoneStatuses(MILESTONES, progress, asOf);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-xs uppercase tracking-block text-muted">Last 18 weeks</h2>
        <ConsistencyGrid bands={bands} from={from} to={to} />
      </section>

      <section>
        <h2 className="mb-1.5 text-xs uppercase tracking-block text-muted">Milestones</h2>
        <div className="border border-edge bg-panel">
          {milestones.map((milestone) => (
            <MilestoneRow
              key={milestone.key}
              milestone={milestone}
              onToggleItem={(item) => onToggleItem(milestone.key, item)}
              onToggleDone={() => onToggleDone(milestone.key)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
