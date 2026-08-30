/**
 * One past day, opened from the calendar.
 *
 * Until now a logged day could only be read on the day itself: the month grid coloured it
 * and nothing let you ask what actually happened. This is read-only on purpose — a day
 * that has closed is a record, and SPEC §3.2's correction rules live on the Day screen
 * where the day is still being worked.
 *
 * Everything here comes from the period already loaded for the month, so opening a day
 * costs no query.
 */
import type { CommitmentRecord, DayRecord, LogRecord } from '../../db/schema';
import { containment } from '../../engine/boundaries';
import { completionOf, isDropped, scoreDay } from '../../engine/scoring';
import type { Prefs } from '../../lib/prefs';
import { formatDuration, toHHMM } from '../../lib/time';
import { DayBar } from '../DayBar';
import { Icon } from '../ui/Icon';
import { Bar, Button, Pill, type Tone } from '../ui/primitives';

const BAND_TONE: Record<string, Tone> = { green: 'pass', yellow: 'warn', red: 'fail' };

export function DayDetail({
  date,
  day,
  commitments,
  log,
  prefs,
  onClose,
}: {
  date: string;
  day: DayRecord | null;
  commitments: CommitmentRecord[];
  log: LogRecord | null;
  prefs: Prefs;
  onClose: () => void;
}) {
  const heading = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (!day) {
    return (
      <div className="card p-5">
        <Header heading={heading} onClose={onClose} />
        <p className="mt-4 text-sm text-soft">
          Nothing recorded for this day. It was never started, so it scores red.
        </p>
      </div>
    );
  }

  const result = scoreDay(commitments, prefs, day.plannedAt !== null);
  const tally = containment(day.blocks);
  const tone: Tone = result.band ? (BAND_TONE[result.band] ?? 'neutral') : 'neutral';

  const earned = Math.round(
    commitments
      .filter((commitment) => !isDropped(commitment))
      .reduce((sum, c) => sum + c.plannedMinutes * completionOf(c), 0),
  );

  return (
    <div className="card p-5">
      <Header heading={heading} onClose={onClose} />

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`font-mono text-3xl font-semibold ${result.band ? '' : 'text-muted'}`}>
          {result.score === null ? '—' : `${result.score}%`}
        </span>
        {result.band ? <Pill tone={tone}>{result.band}</Pill> : null}
        {day.placementMode ? <Pill tone="info">placement day</Pill> : null}
        <span className="font-mono text-xs text-muted">
          {earned} of {result.weight} committed minutes
        </span>
      </div>

      {result.failedGates.length > 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-md bg-fail/10 px-3 py-2 text-xs text-fail">
          <Icon name="alert" size={13} />
          Non-negotiable missed.
        </p>
      ) : null}

      {day.blocks.length > 0 ? (
        <div className="mt-5">
          <DayBar
            blocks={day.blocks}
            /* The day is over: park the live marker past the end so it does not draw. */
            now={Number.MAX_SAFE_INTEGER}
            fillFor={(block) => {
              const attached = commitments.filter(
                (c) => c.blockId === block.blockId && c.status !== 'displaced',
              );
              const weight = attached.reduce((sum, c) => sum + c.plannedMinutes, 0);
              if (weight === 0) return null;
              return (
                attached.reduce((sum, c) => sum + c.plannedMinutes * completionOf(c), 0) / weight
              );
            }}
          />
        </div>
      ) : null}

      <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-edge bg-edge">
        {[
          {
            label: 'Contained',
            value: tally.percent === null ? '—' : `${tally.percent}%`,
          },
          { label: 'Sleep', value: log ? `${log.sleepHours}h` : '—' },
          { label: 'Energy', value: log ? `${log.energy}/5` : '—' },
        ].map((cell) => (
          <div key={cell.label} className="bg-panel px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-block text-muted">{cell.label}</dt>
            <dd className="mt-1 font-mono text-base font-semibold text-text">{cell.value}</dd>
          </div>
        ))}
      </dl>

      {commitments.length > 0 ? (
        <div className="mt-5">
          <p className="eyebrow mb-2">Committed to</p>
          <ul className="space-y-2.5">
            {commitments.map((commitment) => {
              const completion = completionOf(commitment);
              const dropped = isDropped(commitment);
              return (
                <li key={commitment.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={`min-w-0 truncate text-sm ${
                        dropped
                          ? 'text-muted line-through'
                          : completion >= 1
                            ? 'text-deep'
                            : 'text-text'
                      }`}
                    >
                      {commitment.label}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {commitment.targetType === 'binary'
                        ? completion >= 1
                          ? 'done'
                          : 'not done'
                        : `${commitment.done} / ${commitment.target}`}
                      <span className="mx-1.5 text-edge">·</span>
                      {formatDuration(commitment.plannedMinutes)}
                    </span>
                  </div>
                  {commitment.targetType !== 'binary' && !dropped ? (
                    <div className="mt-1.5">
                      <Bar
                        value={completion}
                        tone={completion >= 1 ? 'pass' : 'signal'}
                        height="h-1"
                        animate={false}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-5 text-sm text-soft">Nothing was committed to on this day.</p>
      )}

      {log?.hardestThing ? (
        <div className="mt-5 rounded-lg border border-edge bg-sunk p-4">
          <p className="eyebrow">Hardest thing</p>
          <p className="mt-1.5 text-sm text-soft">{log.hardestThing}</p>
        </div>
      ) : null}

      {day.anchorAt ? (
        <p className="mt-4 font-mono text-xs text-muted">
          anchored {toHHMM(day.anchorAt)}
          {day.pushes.length > 0
            ? ` · pushed ${day.pushes.length}× by ${formatDuration(
                day.pushes.reduce((sum, push) => sum + push.minutes, 0),
              )}`
            : ''}
        </p>
      ) : null}
    </div>
  );
}

function Header({ heading, onClose }: { heading: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-base font-semibold text-text">{heading}</h3>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
