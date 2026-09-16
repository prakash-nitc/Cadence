/**
 * How long you actually worked — SPEC §3.3.
 *
 * Asked when a work block closes, so the hours targets see the time without anyone having
 * to press plus eight times. Opens on a sensible answer — the time so far if the block is
 * still running, the whole block once it has ended — so the common case is one more tap,
 * and a three-hour block done for two is a quick correction rather than impossible.
 */
import { useState } from 'react';
import type { ScheduledBlock } from '../engine/layout';
import { WORKED_MAX, WORKED_STEP, clampWorked } from '../engine/worked';
import { formatDuration } from '../lib/time';
import { Button } from './ui/primitives';

const FRACTIONS: { label: string; share: number }[] = [
  { label: 'All', share: 1 },
  { label: '¾', share: 0.75 },
  { label: '½', share: 0.5 },
  { label: '¼', share: 0.25 },
];

export function WorkedPicker({
  block,
  initial,
  confirmLabel = 'Log',
  onLog,
  onCancel,
}: {
  block: ScheduledBlock;
  initial: number;
  /** The verb on the button, so the same picker reads right when closing or correcting. */
  confirmLabel?: string;
  onLog: (minutes: number) => void;
  onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState(() => clampWorked(initial));
  const snap = (value: number) => Math.round(value / WORKED_STEP) * WORKED_STEP;

  return (
    <div className="rounded-lg border border-edge bg-sunk p-4" data-worked={block.blockId}>
      <p className="text-sm font-medium text-text">How long did you work on {block.label}?</p>
      <p className="mt-0.5 text-xs text-muted">
        The block was <span className="font-mono">{formatDuration(block.minutes)}</span>. Time
        logged here counts toward your hours targets.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            icon="minus"
            aria-label="Fifteen minutes less"
            disabled={minutes <= 0}
            onClick={() => setMinutes((value) => clampWorked(value - WORKED_STEP))}
            className="px-2"
          />
          <span
            className="w-20 text-center font-mono text-lg text-text"
            aria-live="polite"
            data-worked-value
          >
            {formatDuration(minutes)}
          </span>
          <Button
            size="sm"
            icon="plus"
            aria-label="Fifteen minutes more"
            disabled={minutes >= WORKED_MAX}
            onClick={() => setMinutes((value) => clampWorked(value + WORKED_STEP))}
            className="px-2"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FRACTIONS.map(({ label, share }) => {
            const value = snap(block.minutes * share);
            const chosen = value === minutes;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setMinutes(value)}
                aria-pressed={chosen}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  chosen
                    ? 'border-signal bg-wash text-deep'
                    : 'border-edge bg-panel text-soft hover:border-signal/40'
                }`}
              >
                {label} <span className="font-mono">· {formatDuration(value)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="primary" icon="check" onClick={() => onLog(minutes)}>
          {confirmLabel} {formatDuration(minutes)}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
