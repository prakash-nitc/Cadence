import { useState } from 'react';
import type { CommitmentRecord } from '../db/schema';
import { completionOf, isDropped } from '../engine/scoring';
import type { CommitmentEdit } from '../store/dayStore';
import { DropReason } from './DropReason';
import { NumberField } from './NumberField';
import { TagPicker } from './TagPicker';
import { Icon } from './ui/Icon';
import { Bar, Button } from './ui/primitives';

/** One input treatment for every field in this row — §31. */
const FIELD =
  'mt-1 w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm text-text ' +
  'transition-shadow placeholder:text-muted focus:border-signal focus:shadow-focus focus:outline-none';

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
  complete: 'text-deep',
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
  /** Absent where re-planning makes no sense, such as mid-triage. */
  onEdit?: (edit: CommitmentEdit) => void;
  placementMode?: boolean;
}

export function CommitmentRow({
  commitment,
  onDone,
  onDrop,
  onRemove,
  onEdit,
  placementMode = false,
}: CommitmentRowProps) {
  const [dropping, setDropping] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CommitmentEdit>({
    label: commitment.label,
    target: commitment.target,
    plannedMinutes: commitment.plannedMinutes,
    tags: commitment.tags,
  });
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

  /*
   * Three visual states, used identically wherever a commitment appears — §38.
   * Complete is green and quiet, in progress is emphasised, open is neutral.
   */
  const mark =
    dropped ? 'skip' : completion >= 1 ? 'check' : completion > 0 ? 'half' : 'circle';
  const markTone = dropped
    ? 'border-edge text-muted'
    : completion >= 1
      ? 'border-signal bg-signal text-panel'
      : completion > 0
        ? 'border-signal text-signal'
        : 'border-edge text-muted';

  return (
    <div
      className={`-mx-2 rounded-md border-b border-edge px-2 py-2.5 transition-colors last:border-b-0 ${
        completion >= 1 && !dropped ? 'bg-wash/60' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {commitment.targetType === 'binary' ? (
          <button
            type="button"
            disabled={dropped}
            onClick={() => onDone(completion >= 1 ? 0 : 1)}
            aria-label={commitment.label}
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors disabled:opacity-40 ${markTone}`}
          >
            {completion >= 1 ? (
              <Icon name="check" size={13} className="animate-pop-check" />
            ) : null}
          </button>
        ) : (
          <span
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${markTone}`}
            aria-hidden
          >
            <Icon name={mark} size={12} />
          </span>
        )}

        <span className="min-w-0 flex-1">
          {onEdit && !dropped ? (
            <button
              type="button"
              onClick={() => {
                setDraft({
                  label: commitment.label,
                  target: commitment.target,
                  plannedMinutes: commitment.plannedMinutes,
                  tags: commitment.tags,
                });
                setEditing((value) => !value);
              }}
              aria-label={`Edit ${commitment.label}`}
              className={`block text-left text-sm font-medium ${STATUS_TONE[commitment.status]} underline-offset-2 hover:underline`}
            >
              {commitment.label}
            </button>
          ) : (
            <span
              className={`block text-sm font-medium ${STATUS_TONE[commitment.status]} ${
                dropped ? 'line-through' : ''
              }`}
            >
              {commitment.label}
            </span>
          )}
          <span className="mt-0.5 block font-mono text-xs text-muted">
            {progress}
            <span className="mx-1.5 text-edge">·</span>
            {commitment.plannedMinutes} min
            {dropped ? (
              <span className="ml-2 font-sans text-fail">{DROP_LABEL[commitment.status]}</span>
            ) : null}
            {commitment.displacedBy ? (
              <span className="ml-1 font-sans text-muted">— {commitment.displacedBy}</span>
            ) : null}
          </span>
        </span>

        {!dropped && commitment.targetType !== 'binary' ? (
          <span className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              icon="minus"
              aria-label={`Less ${commitment.label}`}
              onClick={() => onDone(Math.max(0, commitment.done - step))}
              className="px-2"
            />
            <Button
              size="sm"
              icon="plus"
              aria-label={`More ${commitment.label}`}
              onClick={() => onDone(commitment.done + step)}
              className="px-2"
            />
          </span>
        ) : null}

        <Button size="sm" variant="ghost" onClick={() => setDropping((value) => !value)}>
          {dropped ? 'Reason' : 'Drop'}
        </Button>
      </div>

      {/*
        The bar is drawn for anything that takes partial credit, not only when part-done.
        An untouched 0-of-4 with a visible empty track reads as work outstanding; the same
        row with no track at all reads as a note.
      */}
      {commitment.targetType !== 'binary' && !dropped ? (
        <div className="mt-2 pl-8">
          <Bar
            value={completion}
            tone={completion >= 1 ? 'pass' : 'signal'}
            height="h-1.5"
            animate={false}
          />
        </div>
      ) : null}

      {editing && onEdit ? (
        <div className="mt-3 rounded-lg border border-edge bg-sunk p-4">
          <label className="block">
            <span className="block text-xs text-muted">What gets finished</span>
            <input
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              aria-label="Commitment name"
              className={FIELD}
            />
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {commitment.targetType !== 'binary' ? (
              <label className="block">
                <span className="block text-xs text-muted">
                  Target{commitment.targetType === 'minutes' ? ' (minutes)' : ''}
                </span>
                <NumberField
                  value={draft.target}
                  onChange={(target) => setDraft({ ...draft, target })}
                  min={1}
                  label="Commitment target"
                  className={`${FIELD} font-mono`}
                />
              </label>
            ) : (
              <span />
            )}

            <label className="block">
              <span className="block text-xs text-muted">Weight (minutes)</span>
              <NumberField
                value={draft.plannedMinutes}
                onChange={(plannedMinutes) => setDraft({ ...draft, plannedMinutes })}
                min={0}
                label="Commitment weight"
                className={`${FIELD} font-mono`}
              />
            </label>
          </div>

          <p className="mt-2 text-xs text-muted">
            Weight is what the score counts this as. It usually matches the time you mean
            to give it.
          </p>

          <div className="mt-3 border-t border-edge pt-3">
            <TagPicker
              tags={draft.tags}
              targetType={commitment.targetType}
              onChange={(tags) => setDraft({ ...draft, tags })}
            />
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              icon="check"
              onClick={() => {
                onEdit(draft);
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </div>
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
          placementMode={placementMode}
          {...(onRemove ? { onRemove } : {})}
        />
      ) : null}
    </div>
  );
}
