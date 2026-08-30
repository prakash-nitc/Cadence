import { useState } from 'react';
import type { CommitmentRecord } from '../db/schema';
import { allowedCorrections, viewStatus, type BlockView } from '../engine/boundaries';
import type { ScheduledBlock } from '../engine/layout';
import type { CommitmentEdit, NewCommitment } from '../store/dayStore';
import { formatDuration, toHHMM } from '../lib/time';
import { AddCommitment } from './AddCommitment';
import { CommitmentRow } from './CommitmentRow';
import { Icon, type IconName } from './ui/Icon';
import { Button } from './ui/primitives';

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
  active: 'text-deep',
  awaiting: 'text-warn',
  contained: 'text-deep',
  overran: 'text-fail',
  skipped: 'text-fail',
};

/**
 * The dot on the timeline rail — §18.
 *
 * Filled for what is done, ringed for what is running, hollow for what has not happened.
 * The status word sits beside it in every case: shape is a shortcut, never the message.
 */
const DOT: Record<BlockView, string> = {
  pending: 'border-edge bg-panel',
  active: 'border-signal bg-panel ring-4 ring-wash',
  awaiting: 'border-warn bg-panel',
  contained: 'border-signal bg-signal',
  overran: 'border-fail bg-fail',
  skipped: 'border-fail bg-panel',
};

const STATUS_ICON: Partial<Record<BlockView, IconName>> = {
  contained: 'check',
  overran: 'alert',
  skipped: 'skip',
  active: 'now',
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
  onEditCommitment?: (id: string, edit: CommitmentEdit) => void;
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
  onEditCommitment,
  placementMode = false,
}: BlockRowProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const status = viewStatus(block, now);

  if (block.kind === 'gap') {
    return (
      <div className="flex gap-4" data-block={block.blockId} data-status="gap">
        <span className="w-[76px] shrink-0 pt-2 text-right font-mono text-xs text-muted">
          {toHHMM(block.startsAt)}
        </span>
        <div className="flex shrink-0 flex-col items-center">
          <span className="mt-2.5 h-1.5 w-1.5 rounded-sm border border-edge" />
          <span className="w-px flex-1 bg-edge" />
        </div>
        <p className="py-1.5 text-sm text-muted">
          Unallocated — {formatDuration(block.minutes)}
        </p>
      </div>
    );
  }

  const corrections = allowedCorrections(block.status);
  const canCorrect = corrections.length > 0;

  const icon = STATUS_ICON[status];

  return (
    <div className="flex gap-4" data-block={block.blockId} data-status={status}>
      {/* The rail: start time, dot, and the line running down to the next block. */}
      <span className="w-[76px] shrink-0 pt-3 text-right font-mono text-xs text-muted">
        {toHHMM(block.startsAt)}
      </span>
      <div className="flex shrink-0 flex-col items-center">
        <span
          className={`mt-3 flex h-3.5 w-3.5 items-center justify-center rounded-sm border-2 ${DOT[status]}`}
          aria-hidden
        />
        <span className="w-px flex-1 bg-edge" />
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <div
          className={`rounded-lg border px-4 py-3 transition-colors ${
            status === 'active'
              ? 'border-signal/45 bg-wash/70'
              : status === 'contained'
                ? 'border-edge bg-panel'
                : status === 'pending'
                  ? 'border-edge bg-panel'
                  : 'border-edge bg-panel'
          }`}
        >
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex w-full items-start gap-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm font-medium ${
                  status === 'pending' ? 'text-soft' : 'text-text'
                } ${status === 'skipped' ? 'line-through' : ''}`}
              >
                {block.label}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted">
                <span>
                  {toHHMM(block.startsAt)}–{toHHMM(block.endsAt)}
                </span>
                <span className="text-edge">·</span>
                <span>{formatDuration(block.minutes)}</span>
                <span className="font-sans capitalize">{block.kind}</span>
              </span>
              {block.missedWindow ? (
                <span className="mt-1 block text-xs text-warn">Outside the mess window.</span>
              ) : null}
            </span>

            {STATUS_LABEL[status] ? (
              <span
                className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${STATUS_TONE[status]}`}
              >
                {icon ? <Icon name={icon} size={13} /> : null}
                {STATUS_LABEL[status]}
              </span>
            ) : null}
          </button>

          {open && canCorrect ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
              <span className="text-xs text-muted">Correct to</span>
              {corrections.map((correction) => (
                <Button
                  key={correction}
                  size="sm"
                  onClick={() => {
                    onCorrect(correction);
                    setOpen(false);
                  }}
                >
                  {CORRECTION_LABEL[correction]}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {commitments.length > 0 && onDone && onDrop ? (
          <div className="mt-2 pl-1">
          {(() => {
            // Resizing a block does not resize what was committed to it. Say so, rather
            // than leaving the arithmetic to be noticed at 10 PM.
            const weight = commitments
              .filter((commitment) => commitment.status !== 'displaced')
              .reduce((sum, commitment) => sum + commitment.plannedMinutes, 0);
            return weight > block.minutes ? (
              <p className="mb-2 flex items-center gap-1.5 rounded-md bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
                <Icon name="alert" size={13} />
                {formatDuration(weight)} committed to a {formatDuration(block.minutes)} block.
              </p>
            ) : null;
          })()}

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
              {...(onEditCommitment
                ? { onEdit: (edit: CommitmentEdit) => onEditCommitment(commitment.id, edit) }
                : {})}
            />
          ))}
          </div>
        ) : null}

        {onAddCommitment && (open || adding) ? (
          adding ? (
            <div className="mt-2">
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
            <div className="mt-2">
              <Button size="sm" variant="ghost" icon="plus" onClick={() => setAdding(true)}>
                Add commitment
              </Button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
