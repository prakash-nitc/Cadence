import type { Band } from '../db/schema';
import type { ScoreResult } from '../engine/scoring';

/**
 * Two numbers, each meaning one thing, neither distorted to compensate for the other —
 * SPEC §4.1. The percentage says how much of the planned weight got finished; the gate
 * says pass or fail on the non-negotiables. A 95% day with the recall drill missed reads
 * "95% — yellow. Recall drill missed."
 */

const BAND_TONE: Record<Band, string> = {
  green: 'text-pass',
  yellow: 'text-warn',
  red: 'text-fail',
};

const BAND_LABEL: Record<Band, string> = {
  green: 'green',
  yellow: 'yellow',
  red: 'red',
};

interface ScoreBadgeProps {
  result: ScoreResult;
  /** Resolves a failed non-negotiable key to the commitment label it refers to. */
  labelFor: (key: string) => string;
  /** "On pace" while the day is still running; the plain score once it is done. */
  projected?: boolean;
}

export function ScoreBadge({ result, labelFor, projected = false }: ScoreBadgeProps) {
  const { score, band, failedGates } = result;

  if (score === null) {
    return (
      <div>
        <span className="font-mono text-2xl text-muted">—</span>
        <p className="mt-0.5 text-xs text-muted">
          {band === 'red'
            ? 'Not planned. A day with nothing committed to scores red.'
            : 'Every commitment displaced. Nothing left to score.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <span className={`font-mono text-2xl ${band ? BAND_TONE[band] : 'text-text'}`}>
        {projected ? 'On pace: ' : ''}
        {score}%
      </span>
      {band ? <span className="ml-2 text-xs text-muted">{BAND_LABEL[band]}</span> : null}

      {failedGates.length > 0 ? (
        <p className="mt-0.5 text-xs text-fail">
          {failedGates.map((key) => labelFor(key)).join(', ')} missed.
        </p>
      ) : null}
    </div>
  );
}
