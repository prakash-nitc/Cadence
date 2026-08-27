import { useState } from 'react';
import type { CommitmentRecord } from '../db/schema';
import { allowedCorrections, viewStatus, type BlockView } from '../engine/boundaries';
import type { ScheduledBlock } from '../engine/layout';
import type { NewCommitment } from '../store/dayStore';
import { formatDuration, toHHMM } from '../lib/time';
import { AddCommitment } from './AddCommitment';
import { CommitmentRow } from './CommitmentRow';

/**
 * One row of the Day screen timeline — SPEC §3.2.
 *
 * Tapping a past block allows honest correction. The options come from
 * `allowedCorrections`, which only ever offers an equal-or-worse outcome, so there is
 * no control here that converts a skip into a containment.
 */

const STATUS_LABEL: Record<BlockView, string> = {
  pending: '',
  active: 'Now',
  awaiting: 'Not answered',
  contained: 'Contained',
  overran: 'Overran',
  skipped: 'Skipped',
};

const STATUS_TONE: Record<BlockView, string> = {
  pending: 'text-muted',
  active: 'text-signal',
  awaiting: 'text-warn',
  contained: 'text-pass',
  overran: 'text-fail',
  skipped: 'text-fail',
};

const CORRECTION_LABEL: Record<'contained' | 'overran' | 'skipped', string> = {
  contained: 'Contained',
  overran: 'Ran over',
  skipped: 'Skipped',
};

interface BlockRowProps {
  block: ScheduledBlock;
  now: number;
  onCorrect: (status: 'contained' | 'overran' | 'skipped') => void;
  /** Commitments attached to this block — the reason the block exists. */
  commitments?: CommitmentRecord[];
  onAddCommitment?: (input: NewCommitment) => void;
  onDone?: (id: string, done: number) => void;
  onDrop?: (
    id: string,
    reason: 'skipped' | 'avoided' | 'displaced',
    displacedBy: string | null,
  ) => void;
  onRemoveCommitment?: (id: string) => void;
  placementMode?: boolean;
}

export function BlockRow({
  block,
  now,
  onCorrect,
  commitments = [],
  onAddCommitment,
  onDone,
  onDrop,
  onRemoveCommitment,
  placementMode = false,
}: BlockRowProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const status = viewStatus(block, now);

  if (block.kind === 'gap') {
    return (
      <div className="flex items-center gap-3 border-l border-edge py-2 pl-3">
        <span className="w-24 shrink-0 font-mono text-xs text-muted">
          {toHHMM(block.startsAt)}
        </span>
        <span className="text-sm text-muted">
          Unallocated — {formatDuration(block.minutes)}
        </span>
      </div>
    );
  }

  const corrections = allowedCorrections(block.status);
  const canCorrect = corrections.length > 0;

  return (
    <div className={`border-l-2 ${status === 'active' ? 'border-signal' : 'border-edge'}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-3 py-2.5 pl-3 text-left"
      >
        <span className="w-24 shrink-0 font-mono text-xs text-muted">
          {toHHMM(block.startsAt)}–{toHHMM(block.endsAt)}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm ${status === 'pending' ? 'text-muted' : 'text-text'} ${
              status === 'skipped' ? 'line-through' : ''
            }`}
          >
            {block.label}
          </span>
          {block.missedWindow ? (
            <span className="block text-xs text-warn">Window had already closed.</span>
          ) : null}
        </span>

        <span className="shrink-0 font-mono text-xs text-muted">
          {formatDuration(block.minutes)}
        </span>
        <span className={`w-24 shrink-0 text-right text-xs ${STATUS_TONE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </button>

      {open && canCorrect ? (
        <div className="flex flex-wrap items-center gap-2 pb-3 pl-3">
          <span className="text-xs text-muted">Correct to</span>
          {corrections.map((correction) => (
            <button
              key={correction}
              type="button"
              onClick={() => {
                onCorrect(correction);
                setOpen(false);
              }}
              className="border border-edge px-2 py-1 text-xs text-text hover:border-muted"
            >
              {CORRECTION_LABEL[correction]}
            </button>
          ))}
        </div>
      ) : null}

      {commitments.length > 0 && onDone && onDrop ? (
        <div className="pb-2 pl-3 pr-1">
          {commitments.map((commitment) => (
            <CommitmentRow
              key={commitment.id}
              commitment={commitment}
              onDone={(done) => onDone(commitment.id, done)}
              onDrop={(reason, displacedBy) => onDrop(commitment.id, reason, displacedBy)}
              placementMode={placementMode}
              {...(onRemoveCommitment
                ? { onRemove: () => onRemoveCommitment(commitment.id) }
                : {})}
            />
          ))}
        </div>
      ) : null}

      {onAddCommitment && (open || adding) ? (
        adding ? (
          <div className="pb-3 pl-3 pr-1">
            <AddCommitment
              blockId={block.blockId}
              defaultMinutes={block.minutes}
              onAdd={(input) => {
                onAddCommitment(input);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <div className="pb-2 pl-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs text-muted underline-offset-2 hover:text-text hover:underline"
            >
              Add commitment
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
