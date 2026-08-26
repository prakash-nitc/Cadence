import { useState } from 'react';
import type { CommitmentRecord } from '../db/schema';
import type { NewCommitment } from '../store/dayStore';

/**
 * Commitment CRUD — SPEC §9 session 3.
 *
 * The nightly flow that pre-composes commitments from carry-overs and the roadmap is
 * session 4. This is the manual path: attach a commitment to a block, name it, set a
 * target. Planned minutes default to the block's own length, because minutes are the
 * weight and the block already knows its own.
 */
interface AddCommitmentProps {
  blockId: string | null;
  defaultMinutes: number;
  onAdd: (input: NewCommitment) => void;
  onCancel: () => void;
}

const TARGET_TYPES: { id: CommitmentRecord['targetType']; label: string }[] = [
  { id: 'count', label: 'Count' },
  { id: 'binary', label: 'Done / not' },
  { id: 'minutes', label: 'Minutes' },
];

export function AddCommitment({
  blockId,
  defaultMinutes,
  onAdd,
  onCancel,
}: AddCommitmentProps) {
  const [label, setLabel] = useState('');
  const [targetType, setTargetType] = useState<CommitmentRecord['targetType']>('count');
  const [target, setTarget] = useState('1');
  const [minutes, setMinutes] = useState(String(defaultMinutes));
  const [tags, setTags] = useState('');

  const submit = (): void => {
    const trimmed = label.trim();
    if (!trimmed) return;

    onAdd({
      blockId,
      label: trimmed,
      targetType,
      target: targetType === 'binary' ? 1 : Math.max(1, Number(target) || 1),
      plannedMinutes: Math.max(0, Number(minutes) || 0),
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  };

  const field = 'w-full border border-edge bg-ink px-2 py-1.5 text-sm text-text focus:border-signal focus:outline-none';

  return (
    <div className="mt-2 border border-edge bg-panel p-3">
      <input
        autoFocus
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && submit()}
        placeholder="What gets finished"
        aria-label="Commitment label"
        className={field}
      />

      <div className="mt-2 flex gap-1">
        {TARGET_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => setTargetType(type.id)}
            className={`flex-1 border px-2 py-1 text-xs ${
              targetType === type.id ? 'border-signal text-signal' : 'border-edge text-muted'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {targetType !== 'binary' ? (
          <label className="block">
            <span className="block text-xs text-muted">Target</span>
            <input
              type="number"
              min="1"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className={`${field} mt-1 font-mono`}
            />
          </label>
        ) : (
          <span />
        )}

        <label className="block">
          <span className="block text-xs text-muted">Weight (minutes)</span>
          <input
            type="number"
            min="0"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            className={`${field} mt-1 font-mono`}
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="block text-xs text-muted">Tags, comma separated</span>
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="dsa, spring"
          className={`${field} mt-1`}
        />
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          className="border border-signal px-3 py-1.5 text-sm text-signal hover:bg-signal/10"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-edge px-3 py-1.5 text-sm text-muted hover:border-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
