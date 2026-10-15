/**
 * Adding to tomorrow, and keeping a plan to reuse — SPEC §3.4.
 *
 * Two small forms under tomorrow's list. Adding a commitment here means tomorrow can be
 * planned on the screen meant for it, instead of the next morning on Day. Saving a template
 * keeps tomorrow's blocks and ticked commitments together, so the next plan is a pick, not
 * an evening of typing.
 */
import { useState } from 'react';
import type { BlockDef } from '../../config/schedule.config';
import type { TargetType, TemplateCommitment } from '../../db/schema';
import { TYPE_HELP } from '../CommitmentRow';
import { NumberField } from '../NumberField';
import { Button } from '../ui/primitives';

const FIELD =
  'w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted focus:border-signal focus:shadow-focus focus:outline-none';

const TYPES: { id: TargetType; label: string }[] = [
  { id: 'count', label: 'Count' },
  { id: 'minutes', label: 'Minutes' },
  { id: 'binary', label: 'Done or not' },
];

export function AddToPlan({
  blocks,
  onAdd,
}: {
  blocks: BlockDef[];
  onAdd: (row: TemplateCommitment) => void;
}) {
  const work = blocks.filter((block) => block.kind === 'work');
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [blockId, setBlockId] = useState<string>(work[0]?.id ?? '');
  const [type, setType] = useState<TargetType>('count');
  const [howMany, setHowMany] = useState(1);
  const [minutes, setMinutes] = useState(work[0]?.minutes ?? 60);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" icon="plus" onClick={() => setOpen(true)}>
        Add a commitment
      </Button>
    );
  }

  const add = (): void => {
    if (!label.trim()) return;
    onAdd({
      blockId: blockId || null,
      label: label.trim(),
      targetType: type,
      target: type === 'binary' ? 1 : type === 'minutes' ? Math.max(1, minutes) : Math.max(1, howMany),
      plannedMinutes: Math.max(0, minutes),
      tags: [],
    });
    setLabel('');
  };

  return (
    <div className="rounded-lg border border-edge bg-sunk p-4" data-add-to-plan>
      <p className="text-sm font-medium text-text">Add to tomorrow</p>

      <input
        autoFocus
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && add()}
        placeholder="What gets finished"
        aria-label="New commitment"
        className={`${FIELD} mt-3`}
      />

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block">
          <span className="block text-xs text-muted">Block</span>
          <select
            value={blockId}
            onChange={(event) => {
              setBlockId(event.target.value);
              const chosen = work.find((block) => block.id === event.target.value);
              if (chosen) setMinutes(chosen.minutes);
            }}
            aria-label="Block"
            className={`${FIELD} mt-1`}
          >
            {work.map((block) => (
              <option key={block.id} value={block.id}>
                {block.label}
              </option>
            ))}
            <option value="">No block</option>
          </select>
        </label>
        <div>
          <span className="block text-xs text-muted">Kind</span>
          <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Kind">
            {TYPES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={type === option.id}
                onClick={() => setType(option.id)}
                className={`rounded-full border px-3 py-2 text-xs transition-colors ${
                  type === option.id
                    ? 'border-signal bg-wash text-deep'
                    : 'border-edge bg-panel text-soft hover:border-signal/40'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">{TYPE_HELP[type]}</p>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
        {type === 'count' ? (
          <label className="block">
            <span className="block text-xs text-muted">How many</span>
            <NumberField value={howMany} onChange={setHowMany} min={1} label="How many" className={`${FIELD} mt-1 font-mono`} />
          </label>
        ) : null}
        <label className="block">
          <span className="block text-xs text-muted">
            {type === 'minutes' ? 'Minutes' : 'Time it takes (minutes)'}
          </span>
          <NumberField value={minutes} onChange={setMinutes} min={type === 'minutes' ? 1 : 0} label="Minutes for it" className={`${FIELD} mt-1 font-mono`} />
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="primary" icon="plus" onClick={add} disabled={!label.trim()}>
          Add
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function SaveTemplate({
  current,
  ticked,
  onSaveNew,
  onUpdate,
}: {
  /** The saved template tomorrow started from, if it was one. */
  current: { id: string; name: string } | null;
  /** Commitments that would be kept. */
  ticked: number;
  onSaveNew: (name: string) => void;
  onUpdate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" icon="bookmark" onClick={() => setOpen(true)}>
          Save as a template
        </Button>
        {saved ? (
          <span className="text-xs text-soft" data-template-saved>
            Saved “{saved}”. Pick it under Start from.
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-edge bg-sunk p-4" data-save-template>
      <p className="text-sm font-medium text-text">Save as a template</p>
      <p className="mt-0.5 text-xs text-muted">
        Keeps tomorrow&apos;s blocks and the <span className="font-mono">{ticked}</span> ticked{' '}
        {ticked === 1 ? 'commitment' : 'commitments'}. Pick it under Start from, and the next
        plan arrives filled in.
      </p>

      {current ? (
        <div className="mt-3">
          <Button
            variant="primary"
            onClick={() => {
              onUpdate(current.id);
              setSaved(current.name);
              setOpen(false);
            }}
          >
            Update “{current.name}”
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name — e.g. Placement weekday"
          aria-label="Template name"
          className={`${FIELD} min-w-[14rem] flex-1`}
        />
        <Button
          variant={current ? 'secondary' : 'primary'}
          disabled={!name.trim()}
          onClick={() => {
            onSaveNew(name.trim());
            setSaved(name.trim());
            setName('');
            setOpen(false);
          }}
        >
          {current ? 'Save as new' : 'Save template'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
