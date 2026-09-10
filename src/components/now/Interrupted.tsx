/**
 * Noting that the work stopped.
 *
 * Records and moves nothing: no boundary shifts, no score changes, no time is bought.
 * A push is for deciding to give the block more room; this is for the fact that you left
 * it, which is the thing worth counting and had nowhere to go.
 *
 * Reasons are a short fixed list on purpose. A free-text field here would be a second
 * diary nobody reads, and it could never be counted.
 */
import { useState } from 'react';
import type { InterruptionReason } from '../../db/schema';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/primitives';

const REASONS: { reason: InterruptionReason; label: string }[] = [
  { reason: 'messages', label: 'Messages or phone' },
  { reason: 'someone', label: 'Someone came in' },
  { reason: 'searching', label: 'Went looking for something' },
  { reason: 'flat', label: 'Ran flat' },
  { reason: 'other', label: 'Something else' },
];

export function Interrupted({
  count,
  onRecord,
}: {
  /** How many times already today. Shown once it is more than one. */
  count: number;
  onRecord: (reason: InterruptionReason) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (!picking) {
    return (
      <Button size="sm" variant="ghost" icon="alert" onClick={() => setPicking(true)}>
        Interrupted
        {count > 0 ? <span className="ml-1 font-mono text-muted">{count}×</span> : null}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-edge bg-sunk p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">What pulled you out?</p>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => setPicking(false)}
          className="rounded-full p-1 text-muted transition-colors hover:bg-panel hover:text-text"
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {REASONS.map(({ reason, label }) => (
          <Button
            key={reason}
            size="sm"
            onClick={() => {
              onRecord(reason);
              setPicking(false);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <p className="mt-2.5 text-xs text-muted">
        Nothing moves. It is counted so the pattern can be named later.
      </p>
    </div>
  );
}
