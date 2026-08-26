import type { CommitmentRecord } from '../db/schema';
import { burnDown, scoreDay, triageOrder, type ScoreResult } from '../engine/scoring';
import type { Prefs } from '../lib/prefs';
import { formatDuration } from '../lib/time';
import { CommitmentRow } from './CommitmentRow';
import { ScoreBadge } from './ScoreBadge';

/**
 * Triage — SPEC §4.1.
 *
 * Lists commitments in reverse priority and lets the user cut until the day is feasible
 * again, re-scoring live. The app does not say "hurry": deciding at 2 PM that today is a
 * three-commitment day is discipline. Discovering at 11 PM that you did 4 of 9 is not.
 */
interface TriageProps {
  commitments: CommitmentRecord[];
  prefs: Prefs;
  planned: boolean;
  availableMinutes: number;
  priorityOf: (blockId: string | null) => number;
  labelFor: (key: string) => string;
  onDone: (id: string, done: number) => void;
  onDrop: (
    id: string,
    reason: 'skipped' | 'avoided' | 'displaced',
    displacedBy: string | null,
  ) => void;
  onClose: () => void;
}

export function Triage({
  commitments,
  prefs,
  planned,
  availableMinutes,
  priorityOf,
  labelFor,
  onDone,
  onDrop,
  onClose,
}: TriageProps) {
  const burn = burnDown(commitments, availableMinutes);
  const result: ScoreResult = scoreDay(commitments, prefs, planned);
  const order = triageOrder(commitments, priorityOf);

  return (
    <section className="border border-edge bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg tracking-display text-text">Triage day</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          Close
        </button>
      </div>

      <p className={`mt-1 font-mono text-xs ${burn.negative ? 'text-fail' : 'text-pass'}`}>
        {formatDuration(burn.committedMinutes)} committed, {formatDuration(burn.availableMinutes)}{' '}
        left
        {burn.negative ? ` — over by ${formatDuration(burn.overBy)}` : ' — feasible'}
      </p>

      <div className="mt-3 border-t border-edge pt-3">
        <ScoreBadge result={result} labelFor={labelFor} />
      </div>

      {order.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing left to cut.</p>
      ) : (
        <div className="mt-4">
          <p className="mb-1 text-xs uppercase tracking-block text-muted">
            Least protected first
          </p>
          {order.map((commitment) => (
            <CommitmentRow
              key={commitment.id}
              commitment={commitment}
              onDone={(done) => onDone(commitment.id, done)}
              onDrop={(reason, displacedBy) => onDrop(commitment.id, reason, displacedBy)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
