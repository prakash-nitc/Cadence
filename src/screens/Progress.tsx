import { useEffect, useMemo, useState } from 'react';
import { FULL_DAY, MILESTONES, WEEKLY_TARGETS } from '../config/schedule.config';
import { ConsistencyGrid } from '../components/ConsistencyGrid';
import { MilestoneRow } from '../components/MilestoneRow';
import { MonthTargetBar } from '../components/MonthTargetBar';
import { TargetBar } from '../components/TargetBar';
import { WeekShape, type ShapeCell } from '../components/WeekShape';
import { committableMinutes } from '../engine/feasibility';
import {
  bandDays,
  milestoneStatuses,
  monthlyPacing,
  tagTotals,
  tallies,
  weeklyPacing,
  weeksInRange,
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

/** Every date in a range, so a frame shows its whole span rather than only logged days. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T12:00:00`);
  for (let at = Date.parse(`${from}T12:00:00`); at <= end; at += 86_400_000) {
    out.push(dateKey(at));
  }
  return out;
}

/** Pad a banded period out to every date in the frame. */
function cellsFor(bands: ReturnType<typeof bandDays>, from: string, to: string): ShapeCell[] {
  const byDate = new Map(bands.map((band) => [band.date, band]));
  return datesBetween(from, to).map((date) => {
    const band = byDate.get(date);
    return band
      ? { date, band: band.band, score: band.score, placementMode: band.placementMode, hasRecord: true }
      : { date, band: null, score: null, placementMode: false, hasRecord: false };
  });
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
  const {
    loaded,
    days,
    commitments,
    logs,
    milestoneProgress,
    monthTargets,
    load,
    loadMonth,
    saveMonthTargets,
    toggleChecklistItem,
    toggleDone,
  } = useProgress();
  const [horizon, setHorizon] = useState<Horizon>('Week');
  const [month, setMonth] = useState<string>(() => (date ?? '2026-01-01').slice(0, 7));

  useEffect(() => {
    if (date) void load(date);
  }, [date, load]);

  // Follow the active day until the user navigates away from it themselves.
  useEffect(() => {
    if (date) setMonth(date.slice(0, 7));
  }, [date]);

  useEffect(() => {
    void loadMonth(month);
  }, [month, loadMonth]);

  const milestoneTargetsFor = (key: string) => monthTargets.get(key) ?? {};

  const period = useMemo<Period>(() => ({ days, commitments, logs }), [days, commitments, logs]);

  if (!date || !loaded) return <p className="text-sm text-muted">Loading.</p>;

  const weekFrom = startOfWeek(date);
  const weekTo = dateKey(addDays(new Date(`${weekFrom}T12:00:00`), 6));
  const calendarDaysLeft = Math.max(
    0,
    Math.round((Date.parse(`${weekTo}T12:00:00`) - Date.parse(`${date}T12:00:00`)) / 86_400_000) + 1,
  );

  // A placement day is not a day the week can pace work across — SPEC §4.6 re-paces
  // around it rather than counting it as a hole the user failed to fill.
  const placementDaysLeft = days.filter(
    (entry) => entry.placementMode && entry.date >= date && entry.date <= weekTo,
  ).length;
  const daysLeftInWeek = Math.max(0, calendarDaysLeft - placementDaysLeft);

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
          from={weekFrom}
          to={weekTo}
        />
      ) : null}

      {horizon === 'Month' ? (
        <MonthView
          period={period}
          prefs={prefs}
          today={date}
          month={month}
          onMonth={setMonth}
          overrides={milestoneTargetsFor(month)}
          onSave={(targets) => void saveMonthTargets(month, targets, Date.now())}
        />
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
  from,
  to,
}: {
  period: Period;
  prefs: Prefs;
  daysLeft: number;
  capacity: number;
  label: string;
  from: string;
  to: string;
}) {
  const bands = bandDays(period, prefs);
  const shape = weekShape(bands, prefs);
  const paces = weeklyPacing(period, WEEKLY_TARGETS, daysLeft, capacity);

  return (
    <div className="space-y-5">
      <WeekShape shape={shape} label={label} cells={cellsFor(bands, from, to)} weekdays />

      <section>
        {/* Said once, rather than on all eight rows. */}
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-block text-muted">Targets</h2>
          <span className="font-mono text-xs text-muted">
            {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
          </span>
        </div>
        <div className="border border-edge bg-panel">
          {paces.map((pace) => (
            <TargetBar key={pace.id} pace={pace} totalDays={7} />
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

function MonthView({
  period,
  prefs,
  today,
  month,
  onMonth,
  overrides,
  onSave,
}: {
  period: Period;
  prefs: Prefs;
  today: string;
  month: string;
  onMonth: (month: string) => void;
  overrides: Record<string, { min: number; max: number | null }>;
  onSave: (targets: Record<string, { min: number; max: number | null }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(overrides);
  useEffect(() => setDraft(overrides), [overrides]);

  const from = `${month}-01`;
  const to = endOfMonth(from);
  const daysInMonth =
    Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000) + 1;

  const thisMonth = slice(period, from, to);
  const previousEnd = dateKey(addDays(new Date(`${from}T12:00:00`), -1));
  const lastMonth = slice(period, startOfMonth(previousEnd), previousEnd);

  const monthBands = bandDays(thisMonth, prefs);
  const shape = weekShape(monthBands, prefs);
  const previousShape = weekShape(bandDays(lastMonth, prefs), prefs);
  const totals = tagTotals(thisMonth);
  const delta = shape.green - previousShape.green;

  const weeks = weeksInRange(from, to);
  // Weeks that have not finished yet. A month in the future has all of them left.
  const weeksRemaining = weeks.filter((week) => week.to >= today).length;

  const paces = monthlyPacing(
    thisMonth,
    WEEKLY_TARGETS,
    editing ? draft : overrides,
    weeks,
    weeksRemaining,
    daysInMonth,
    (committableMinutes(FULL_DAY) / 60) * 7,
  );

  const shift = (by: number): void => {
    const at = new Date(`${from}T12:00:00`);
    onMonth(dateKey(new Date(at.getFullYear(), at.getMonth() + by, 1, 12)).slice(0, 7));
  };

  const state = month > today.slice(0, 7) ? 'ahead' : month < today.slice(0, 7) ? 'done' : 'running';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="border border-edge px-2.5 py-1 font-mono text-sm text-muted hover:border-muted hover:text-text"
        >
          ‹
        </button>
        <span className="font-mono text-sm text-text">
          {month}
          <span className="ml-2 text-xs text-muted">
            {state === 'ahead' ? 'not started' : state === 'done' ? 'finished' : 'running'}
          </span>
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="border border-edge px-2.5 py-1 font-mono text-sm text-muted hover:border-muted hover:text-text"
        >
          ›
        </button>
      </div>

      <WeekShape
        shape={shape}
        label={`Month of ${month}`}
        cells={cellsFor(monthBands, from, today < to ? today : to)}
      />

      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-block text-muted">Targets</h2>
          <span className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-muted">
              {weeksRemaining} of {weeks.length} weeks left
            </span>
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onSave(draft);
                    setEditing(false);
                  }}
                  className="border border-signal px-2 py-0.5 text-xs text-signal hover:bg-signal/10"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(overrides);
                    setEditing(false);
                  }}
                  className="text-xs text-muted underline-offset-2 hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="border border-edge px-2 py-0.5 text-xs text-muted hover:border-muted hover:text-text"
              >
                Edit
              </button>
            )}
          </span>
        </div>

        {editing ? (
          <p className="mb-1.5 text-xs text-muted">
            These are this month’s numbers. They start from the weekly targets scaled to the
            month; change what this month actually asks for.
          </p>
        ) : null}

        <div className="border border-edge bg-panel">
          {paces.map((pace) => (
            <MonthTargetBar
              key={pace.id}
              pace={pace}
              totalWeeks={weeks.length}
              editing={editing}
              onMin={(min) =>
                setDraft({ ...draft, [pace.id]: { min, max: draft[pace.id]?.max ?? null } })
              }
            />
          ))}
        </div>
      </section>

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
