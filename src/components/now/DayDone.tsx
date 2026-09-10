/**
 * The day closed out — SPEC §3.1.
 *
 * Every block answered for, and Now still looked like a screen waiting for work. This
 * says what the day came to and hands over to the review, which is the only thing left
 * to do.
 *
 * The score here is the day's actual ratio, not a projection: there is nothing left to
 * project. It states the number and stops — a finished day needs no commentary.
 */
import type { ScoreResult } from '../../engine/scoring';
import { formatDuration } from '../../lib/time';
import { BAND_TONE } from './NowParts';
import { Icon } from '../ui/Icon';
import { Button, Ring, TONE_TEXT, type Tone } from '../ui/primitives';

export function DayDone({
  result,
  earnedMinutes,
  contained,
  blocks,
  note,
  logged,
  onPlan,
}: {
  result: ScoreResult;
  earnedMinutes: number;
  contained: number;
  blocks: number;
  /** What the day was for, if anything was written. */
  note: string;
  /** Whether the night review has already been saved. */
  logged: boolean;
  onPlan: () => void;
}) {
  const tone: Tone = result.band ? BAND_TONE[result.band] : 'neutral';

  return (
    <section className="card p-6">
      <p className="eyebrow flex items-center gap-2 text-deep">
        <Icon name="check" size={13} />
        Day worked
      </p>

      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="flex justify-center sm:justify-start">
          <Ring
            value={result.score === null ? null : result.score / 100}
            tone={tone}
            label={result.band ?? 'not scored'}
            size={128}
          />
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <dt className="text-xs text-muted">Blocks contained</dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold text-text">
              {contained}
              <span className="text-sm text-muted"> of {blocks}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Committed work done</dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold text-text">
              {formatDuration(earnedMinutes)}
            </dd>
          </div>

          {result.failedGates.length > 0 ? (
            <div className="col-span-2">
              <dt className="text-xs text-muted">Non-negotiable</dt>
              <dd className={`mt-0.5 text-sm ${TONE_TEXT.fail}`}>Missed.</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {note ? (
        <div className="mt-5 rounded-lg border border-edge bg-sunk p-4">
          <p className="eyebrow">What it was for</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-soft">{note}</p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" icon="plan" onClick={onPlan}>
          {logged ? 'Plan tomorrow' : 'Log it and plan tomorrow'}
        </Button>
        {logged ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Icon name="check" size={13} />
            Reviewed.
          </span>
        ) : (
          <span className="text-xs text-muted">The review is the last thing.</span>
        )}
      </div>
    </section>
  );
}
