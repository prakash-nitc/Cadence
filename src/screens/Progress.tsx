import { useEffect, useMemo, useState } from 'react';
import { FULL_DAY, MILESTONES, type WeeklyTarget } from '../config/schedule.config';
import {
  BarChart,
  Heatmap,
  LineChart,
  MonthCalendar,
  type CalendarDay,
  type HeatCell,
  type SeriesPoint,
} from '../components/charts/Charts';
import { ConsistencyGrid } from '../components/ConsistencyGrid';
import { MilestoneRow } from '../components/MilestoneRow';
import { MonthTargetBar } from '../components/MonthTargetBar';
import { TargetBar } from '../components/TargetBar';
import { WeekShape, type ShapeCell } from '../components/WeekShape';
import { committableMinutes } from '../engine/feasibility';
import { Icon } from '../components/ui/Icon';
import {
  Button,
  Card,
  Panel,
  Ring,
  SectionTitle,
  TONE_TEXT,
  type Tone,
} from '../components/ui/primitives';
import {
  bandDays,
  dailyEffort,
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

const BAND_TO_TONE: Record<'green' | 'yellow' | 'red', Tone> = {
  green: 'pass',
  yellow: 'warn',
  red: 'fail',
};

/** Mean score across days that were actually scored. Null with none — never a zero. */
function meanScore(bands: ReturnType<typeof bandDays>): number | null {
  const scored = bands.filter((band) => band.score !== null);
  if (scored.length === 0) return null;
  return Math.round(
    scored.reduce((sum, band) => sum + (band.score ?? 0), 0) / scored.length,
  );
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** One point per calendar day in the frame, so an unlogged day breaks the line. */
function scoreSeries(
  bands: ReturnType<typeof bandDays>,
  from: string,
  to: string,
): SeriesPoint[] {
  const byDate = new Map(bands.map((band) => [band.date, band]));
  return datesBetween(from, to).map((date) => {
    const band = byDate.get(date);
    const at = new Date(`${date}T12:00:00`);
    return {
      label: WEEKDAY[(at.getDay() + 6) % 7] ?? date.slice(8),
      value: band?.score ?? null,
      ...(band?.band ? { detail: band.band } : {}),
    };
  });
}

/**
 * How the week actually went, in words — §36.
 *
 * The state stays honest; the wording says what to do about it rather than announcing a
 * failure. "Three days below target" is the same fact as "3 RED DAYS" without the shout.
 */
function weekVerdict(
  shape: ReturnType<typeof weekShape>,
  prefs: Prefs,
): { tone: Tone; headline: string; detail: string } {
  const logged = shape.green + shape.yellow + shape.red;
  if (logged === 0) {
    return {
      tone: 'neutral',
      headline: 'Nothing logged yet',
      detail: 'The week starts scoring as soon as a day is planned and worked.',
    };
  }
  const want = prefs.weekShape;

  if (shape.red > want.maxRed) {
    return {
      tone: 'fail',
      headline: 'Needs attention',
      detail: `${shape.red} days below target, against a limit of ${want.maxRed}.`,
    };
  }
  if (shape.green >= want.minGreen) {
    return {
      tone: 'pass',
      headline: 'On track',
      detail: `${shape.green} green days, at or above the ${want.minGreen} you set.`,
    };
  }
  return {
    tone: 'warn',
    headline: 'Behind the shape',
    detail: `${shape.green} of ${want.minGreen} green days so far.`,
  };
}

/** The heading block every horizon opens with — §24. */
function ProgressHero({
  eyebrow,
  score,
  tone,
  headline,
  detail,
  delta,
  deltaLabel,
  children,
}: {
  eyebrow: string;
  score: number | null;
  tone: Tone;
  headline: string;
  detail: string;
  delta?: number | null;
  deltaLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="grid grid-cols-1 gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
      <div className="flex justify-center md:justify-start">
        <Ring value={score === null ? null : score / 100} tone={tone} label={eyebrow} />
      </div>

      <div className="min-w-0">
        <h2 className={`text-lg font-semibold ${TONE_TEXT[tone]}`}>{headline}</h2>
        <p className="mt-1 text-sm text-soft">{detail}</p>

        {delta !== undefined && delta !== null && delta !== 0 ? (
          <p
            className={`mt-3 flex items-center gap-1.5 text-sm ${
              delta > 0 ? 'text-deep' : 'text-fail'
            }`}
          >
            <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} size={14} />
            <span className="font-mono">{delta > 0 ? '+' : ''}{delta}</span>
            <span className="text-soft">{deltaLabel}</span>
          </p>
        ) : null}

        {children}
      </div>
    </Card>
  );
}

export function Progress({ prefs, targets }: { prefs: Prefs; targets: WeeklyTarget[] }) {
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
      <header className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-edge bg-panel p-1">
          {HORIZONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setHorizon(option)}
              aria-pressed={horizon === option}
              className={`rounded-sm px-4 py-1.5 text-sm transition-colors ${
                horizon === option
                  ? 'bg-wash font-medium text-deep'
                  : 'text-soft hover:text-text'
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
          targets={targets}
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
          onSave={(next) => void saveMonthTargets(month, next, Date.now())}
          targets={targets}
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
      <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-edge bg-edge">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-panel px-4 py-3">
            <dt className="text-[11px] uppercase tracking-block text-muted">{cell.label}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-text">{cell.value}</dd>
          </div>
        ))}
      </dl>

      {t.energyTrend.length > 1 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-muted">Energy, day by day</p>
          <div className="flex h-8 items-end gap-1">
            {t.energyTrend.map((value, index) => (
              <div
                key={index}
                className="flex-1 rounded-sm bg-mint/60"
                style={{ height: `${(value / 5) * 100}%` }}
                title={`Energy ${value} of 5`}
              />
            ))}
          </div>
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
  targets,
}: {
  period: Period;
  prefs: Prefs;
  daysLeft: number;
  capacity: number;
  label: string;
  from: string;
  to: string;
  targets: WeeklyTarget[];
}) {
  const bands = bandDays(period, prefs);
  const shape = weekShape(bands, prefs);
  const paces = weeklyPacing(period, targets, daysLeft, capacity);
  const verdict = weekVerdict(shape, prefs);
  const average = meanScore(bands);

  const effort = dailyEffort(period);
  const effortByDate = new Map(effort.map((day) => [day.date, day]));
  const focus: SeriesPoint[] = datesBetween(from, to).map((date) => {
    const at = new Date(`${date}T12:00:00`);
    const day = effortByDate.get(date);
    return {
      label: WEEKDAY[(at.getDay() + 6) % 7] ?? date.slice(8),
      value: day ? day.earnedMinutes / 60 : null,
    };
  });

  /*
   * The behind-most target, named. §37: derived from the paces already computed, never
   * a statistic invented for the insight line.
   */
  const behindMost = paces
    .filter((pace) => pace.tracked && pace.achieved < pace.min && pace.min > 0)
    .sort((a, b) => a.achieved / a.min - b.achieved / b.min)[0];

  return (
    <div className="space-y-5">
      <ProgressHero
        eyebrow="this week"
        score={average}
        tone={verdict.tone}
        headline={verdict.headline}
        detail={verdict.detail}
      >
        <p className="mt-3 font-mono text-xs text-muted">
          {label} · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
        </p>
      </ProgressHero>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Day by day" icon="calendar">
          <WeekShape shape={shape} label={label} cells={cellsFor(bands, from, to)} weekdays />
        </Panel>

        <Panel title="Score across the week" icon="chart">
          <LineChart points={scoreSeries(bands, from, to)} />
        </Panel>
      </section>

      <section>
        <SectionTitle
          action={
            <span className="font-mono text-xs text-muted">
              {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
            </span>
          }
        >
          Targets
        </SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {paces.map((pace) => (
            <TargetBar key={pace.id} pace={pace} totalDays={7} />
          ))}
        </div>

        {behindMost ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-edge bg-sunk px-4 py-3 text-sm text-soft">
            <Icon name="sparkle" size={14} className="shrink-0 text-muted" />
            <span>
              <span className="font-medium text-text">{behindMost.label}</span> is furthest
              behind — {behindMost.achieved} of {behindMost.min}
              {behindMost.unit === 'hours' ? ' hrs' : ` ${behindMost.unit}`}.
            </span>
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Focus time" icon="clock">
          <BarChart points={focus} />
        </Panel>

        <Panel title="This week" icon="progress">
          <Tallies period={period} />
        </Panel>
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
  targets,
}: {
  period: Period;
  prefs: Prefs;
  today: string;
  month: string;
  onMonth: (month: string) => void;
  overrides: Record<string, { min: number; max: number | null }>;
  onSave: (targets: Record<string, { min: number; max: number | null }>) => void;
  targets: WeeklyTarget[];
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
    targets,
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

  const average = meanScore(monthBands);
  const calendar: CalendarDay[] = monthBands.map((band) => ({
    date: band.date,
    tone: band.band ? BAND_TO_TONE[band.band] as 'pass' | 'warn' | 'fail' : null,
    title: `${band.date} \u2014 ${band.score === null ? 'not scored' : `${band.score}%`}${
      band.placementMode ? ' \u00b7 placement day' : ''
    }`,
  }));

  const logged = shape.green + shape.yellow + shape.red;
  // The weekly shape scaled by however many weeks the month holds.
  const tone: Tone =
    logged === 0
      ? 'neutral'
      : shape.red > prefs.weekShape.maxRed * weeks.length
        ? 'fail'
        : shape.green >= prefs.weekShape.minGreen * weeks.length
          ? 'pass'
          : 'warn';

  return (
    <div className="space-y-5">
      <ProgressHero
        eyebrow="this month"
        score={average}
        tone={tone}
        headline={
          state === 'ahead' ? 'Not started' : state === 'done' ? 'Finished' : 'Running'
        }
        detail={
          logged === 0
            ? 'No days scored in this month yet.'
            : `${shape.green} green, ${shape.yellow} yellow and ${shape.red} red across ${logged} scored days.`
        }
        delta={
          previousShape.green + previousShape.yellow + previousShape.red === 0 ? null : delta
        }
        deltaLabel="green days against last month"
      />

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel title="Calendar" icon="calendar">
          <MonthCalendar
            month={month}
            days={calendar}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
          />
        </Panel>

        <Panel title={`Month of ${month}`} icon="progress">
          <WeekShape
            shape={shape}
            label={`Month of ${month}`}
            cells={cellsFor(monthBands, from, today < to ? today : to)}
          />
          <div className="mt-5">
            <Tallies period={thisMonth} />
          </div>
        </Panel>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="eyebrow">Targets</h2>
          <span className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-muted">
              {weeksRemaining} of {weeks.length} weeks left
            </span>
            {editing ? (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  icon="check"
                  onClick={() => {
                    onSave(draft);
                    setEditing(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(overrides);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </span>
        </div>

        {editing ? (
          <p className="mb-1.5 text-xs text-muted">
            These are this month’s numbers. They start from the weekly targets scaled to the
            month; change what this month actually asks for.
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-edge bg-panel">
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

      <Panel title="Where the time went" icon="chart">
        {totals.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged this month.</p>
        ) : (
          <BarChart
            points={totals.map((entry) => ({
              label: entry.tag,
              value: entry.minutes / 60,
            }))}
          />
        )}
      </Panel>
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

  /*
   * Heat is earned minutes against the busiest day in the range, so intensity means
   * "a lot of work for you" rather than "a lot of work in the abstract" — §28.
   */
  const effort = dailyEffort(period);
  const peak = Math.max(1, ...effort.map((day) => day.earnedMinutes));
  const effortByDate = new Map(effort.map((day) => [day.date, day]));

  const cells: HeatCell[] = datesBetween(from, to).map((date) => {
    const day = effortByDate.get(date);
    return {
      date,
      intensity: day ? day.earnedMinutes / peak : null,
      title: day
        ? `${date} \u2014 ${Math.round((day.earnedMinutes / 60) * 10) / 10} hrs of ${
            Math.round((day.committedMinutes / 60) * 10) / 10
          } committed`
        : `${date} \u2014 nothing logged`,
    };
  });

  const done = milestones.filter((milestone) => milestone.status === 'done').length;

  return (
    <div className="space-y-5">
      <Panel title="Activity" icon="bolt">
        <Heatmap cells={cells} />
        <p className="mt-3 text-xs text-muted">
          Each square is a day, shaded by the work that actually landed. Not a streak:
          nothing here resets, and one quiet day costs you nothing.
        </p>
      </Panel>

      <Panel title="Bands, last 18 weeks" icon="calendar">
        <ConsistencyGrid bands={bands} from={from} to={to} />
      </Panel>

      <section>
        <SectionTitle
          action={
            <span className="font-mono text-xs text-muted">
              {done} of {milestones.length} done
            </span>
          }
        >
          Milestones
        </SectionTitle>
        <div className="overflow-hidden rounded-lg border border-edge bg-panel">
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
