import { useState } from 'react';
import { DISPLACEMENT_REASONS } from '../config/schedule.config';

/**
 * The drop-reason picker — SPEC §4.1. Dropping a commitment requires a reason, and the
 * distinction between the three is the whole point.
 *
 * Each option states its own effect, so the lenient one is never the path of least
 * resistance. Displacement also asks what displaced it: "something more important came
 * up" is a claim the app makes you name.
 */
const REASONS = [
  {
    id: 'displaced' as const,
    label: 'Displaced',
    effect: 'Something higher-priority took the slot. Leaves scoring, accrues to weekly debt.',
  },
  {
    id: 'skipped' as const,
    label: 'Skipped',
    effect: 'Nothing took the slot. Scores zero and fails the gate if non-negotiable.',
  },
  {
    id: 'avoided' as const,
    label: 'Avoided',
    effect: 'Scores the same as skipped, and is tagged as avoidance.',
  },
];

interface DropReasonProps {
  current: string | null;
  onPick: (reason: 'skipped' | 'avoided' | 'displaced', displacedBy: string | null) => void;
  onCancel: () => void;
  onRemove?: () => void;
}

export function DropReason({ current, onPick, onCancel, onRemove }: DropReasonProps) {
  const [displacing, setDisplacing] = useState(false);

  if (displacing) {
    return (
      <div className="mt-2 border border-edge bg-panel p-3">
        <p className="text-xs uppercase tracking-block text-muted">Displaced by</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DISPLACEMENT_REASONS.map((reason) => (
            <button
              key={reason.id}
              type="button"
              onClick={() => onPick('displaced', reason.label)}
              className="border border-edge px-2 py-1 text-xs text-text hover:border-muted"
            >
              {reason.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDisplacing(false)}
          className="mt-3 text-xs text-muted underline-offset-2 hover:underline"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 border border-edge bg-panel p-3">
      <div className="grid gap-2">
        {REASONS.map((reason) => (
          <button
            key={reason.id}
            type="button"
            onClick={() =>
              reason.id === 'displaced' ? setDisplacing(true) : onPick(reason.id, null)
            }
            className={`border px-3 py-2 text-left ${
              current === reason.id ? 'border-muted' : 'border-edge'
            } hover:border-muted`}
          >
            <span className="block text-sm text-text">{reason.label}</span>
            <span className="block text-xs text-muted">{reason.effect}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          Cancel
        </button>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-fail underline-offset-2 hover:underline"
          >
            Delete commitment
          </button>
        ) : null}
      </div>
    </div>
  );
}
