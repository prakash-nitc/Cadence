import { useState } from 'react';
import type { CommitmentRecord } from '../db/schema';
import { completionOf, isDropped } from '../engine/scoring';
import { DropReason } from './DropReason';

/**
 * One commitment — SPEC §3.1's tappable checklist, with its target.
 *
 * Counts and minutes take partial credit, so the control has to express "2 of 4" rather
 * than a checkbox. Binary commitments are a single tap.
 *
 * A dropped commitment cannot be tapped back to open. The reason can be corrected — the
 * spec's guard against everything becoming "displaced" is weekly debt, not immutability —
 * but a missed commitment stays missed.
 */

const MINUTE_STEP = 15;

const STATUS_TONE: Record<CommitmentRecord['status'], string> = {
  open: 'text-text',
  partial: 'text-text',
  complete: 'text-pass',
  skipped: 'text-fail',
  avoided: 'text-fail',
  displaced: 'text-muted',
};

const DROP_LABEL: Record<string, string> = {
  skipped: 'Skipped',
  avoided: 'Avoided',
  displaced: 'Displaced',
};

interface CommitmentRowProps {
  commitment: CommitmentRecord;
  onDone: (done: number) => void;
  onDrop: (reason: 'skipped' | 'avoided' | 'displaced', displacedBy: string | null) => void;
  onRemove?: () => void;
}

export function CommitmentRow({ commitment, onDone, onDrop, onRemove }: CommitmentRowProps) {
  const [dropping, setDropping] = useState(false);
  const dropped = isDropped(commitment);
  const completion = completionOf(commitment);
  const step = commitment.targetType === 'minutes' ? MINUTE_STEP : 1;

  const progress =
    commitment.targetType === 'binary'
      ? completion >= 1
        ? 'done'
        : 'not done'
      : commitment.targetType === 'minutes'
        ? `${commitment.done} / ${commitment.target}m`
        : `${commitment.done} / ${commitment.target}`;

  return (
    <div className="border-b border-edge py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        {commitment.targetType === 'binary' ? (
          <button
            type="button"
            disabled={dropped}
            onClick={() => onDone(completion >= 1 ? 0 : 1)}
            aria-label={commitment.label}
            className={`h-4 w-4 shrink-0 border disabled:opacity-40 ${
              completion >= 1 ? 'border-pass bg-pass' : 'border-edge'
            }`}
          />
        ) : (
          <span
            className="h-4 w-1 shrink-0 bg-edge"
            style={{ boxShadow: 'none' }}
            aria-hidden
          />
        )}

        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm ${STATUS_TONE[commitment.status]} ${
              dropped ? 'line-through' : ''
            }`}
          >
            {commitment.label}
          </span>
          <span className="block font-mono text-xs text-muted">
            {progress}
            <span className="ml-2">{commitment.plannedMinutes}m</span>
            {dropped ? (
              <span className="ml-2 text-fail">{DROP_LABEL[commitment.status]}</span>
            ) : null}
            {commitment.displacedBy ? (
              <span className="ml-1 text-muted">— {commitment.displacedBy}</span>
            ) : null}
          </span>
        </span>

        {!dropped && commitment.targetType !== 'binary' ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onDone(Math.max(0, commitment.done - step))}
              aria-label={`Less ${commitment.label}`}
              className="border border-edge px-2 py-1 font-mono text-xs text-muted hover:border-muted hover:text-text"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => onDone(commitment.done + step)}
              aria-label={`More ${commitment.label}`}
              className="border border-edge px-2 py-1 font-mono text-xs text-muted hover:border-muted hover:text-text"
            >
              +
            </button>
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setDropping((value) => !value)}
          className="shrink-0 border border-edge px-2 py-1 text-xs text-muted hover:border-muted hover:text-text"
        >
          {dropped ? 'Reason' : 'Drop'}
        </button>
      </div>

      {completion > 0 && completion < 1 ? (
        <div className="mt-1.5 h-px w-full bg-edge">
          <div className="h-px bg-signal" style={{ width: `${completion * 100}%` }} />
        </div>
      ) : null}

      {dropping ? (
        <DropReason
          current={dropped ? commitment.status : null}
          onPick={(reason, displacedBy) => {
            onDrop(reason, displacedBy);
            setDropping(false);
          }}
          onCancel={() => setDropping(false)}
          {...(onRemove ? { onRemove } : {})}
        />
      ) : null}
    </div>
  );
}
