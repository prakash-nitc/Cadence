import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FIXED_WINDOWS,
  type BlockDef,
  type BlockKind,
  type Priority,
} from '../config/schedule.config';
import { layoutDay, type ScheduledBlock } from '../engine/layout';
import { NumberField } from './NumberField';
import { formatDuration, toHHMM } from '../lib/time';

/**
 * The day builder — SPEC §2.6.
 *
 * Add, remove, reorder and resize blocks. A template is a starting point, not a cage:
 * the ideal day is what it describes, and any real day can be arranged from it.
 *
 * Every row shows the clock time it will actually land at, computed by running the real
 * layout engine on each edit rather than by adding minutes up in the component. That
 * means what you see here is exactly what Start day will lay out, meal windows and all —
 * arranging a day blind was the reason the builder was unusable for planning.
 */
const KINDS: BlockKind[] = ['work', 'break', 'meal', 'routine'];

const PRIORITY_LABEL: Record<Priority, string> = {
  0: 'Protected',
  1: 'Compressible',
  2: 'Droppable',
  3: 'Fixed',
};

interface Laid {
  startsAt: number;
  endsAt: number;
  missedWindow: boolean;
  /** Idle time before this block while it waits for a mess window to open. */
  waitMinutes: number;
}

interface BlockBuilderProps {
  blocks: BlockDef[];
  onChange: (blocks: BlockDef[]) => void;
  /** The moment the day starts, so rows can show real clock times. */
  anchor: Date;
  availableMinutes: number;
}

function Row({
  block,
  laid,
  onPatch,
  onRemove,
}: {
  block: BlockDef;
  laid: Laid | null;
  onPatch: (change: Partial<BlockDef>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`border-b border-edge px-2 py-2 last:border-b-0 ${isDragging ? 'bg-ink' : ''}`}
    >
      {laid && laid.waitMinutes > 0 ? (
        <p className="mb-1.5 pl-6 font-mono text-xs text-muted">
          {formatDuration(laid.waitMinutes)} free, waiting for the window
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${block.label}`}
          className="shrink-0 cursor-grab px-1 font-mono text-sm text-muted hover:text-text active:cursor-grabbing"
        >
          ⠿
        </button>

        <input
          value={block.label}
          onChange={(event) => onPatch({ label: event.target.value })}
          aria-label={`${block.label} name`}
          className="min-w-0 flex-1 border border-transparent bg-transparent px-1 py-0.5 text-sm text-text focus:border-edge focus:outline-none"
        />

        {laid ? (
          <span
            className={`shrink-0 font-mono text-xs ${
              laid.missedWindow ? 'text-warn' : 'text-muted'
            }`}
          >
            {toHHMM(laid.startsAt)}–{toHHMM(laid.endsAt)}
          </span>
        ) : null}

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${block.label}`}
          className="shrink-0 border border-edge px-2 py-1 text-xs text-muted hover:border-fail hover:text-fail"
        >
          ×
        </button>
      </div>

      {laid?.missedWindow ? (
        <p className="mt-1 pl-6 text-xs text-warn">
          Outside the mess window. Drag it earlier, or remove it.
        </p>
      ) : null}

      <div className="mt-1.5 flex items-center gap-2 pl-6">
        <select
          value={block.kind}
          onChange={(event) => onPatch({ kind: event.target.value as BlockKind })}
          aria-label={`${block.label} kind`}
          className="min-w-0 flex-1 border border-edge bg-ink px-1.5 py-1 text-xs text-muted focus:border-signal focus:outline-none"
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>

        <select
          value={block.priority}
          onChange={(event) => onPatch({ priority: Number(event.target.value) as Priority })}
          aria-label={`${block.label} priority`}
          className="min-w-0 flex-1 border border-edge bg-ink px-1.5 py-1 text-xs text-muted focus:border-signal focus:outline-none"
        >
          {([0, 1, 2, 3] as Priority[]).map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABEL[priority]}
            </option>
          ))}
        </select>

        <span className="flex shrink-0 items-baseline gap-1">
          <NumberField
            value={block.minutes}
            onChange={(minutes) => onPatch({ minutes })}
            min={5}
            step={5}
            label={`${block.label} minutes`}
            className="w-16 border border-edge bg-ink px-1.5 py-1 text-right font-mono text-xs text-text focus:border-signal focus:outline-none"
          />
          <span className="font-mono text-xs text-muted">m</span>
        </span>
      </div>
    </div>
  );
}

export function BlockBuilder({ blocks, onChange, anchor, availableMinutes }: BlockBuilderProps) {
  const [label, setLabel] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The same function Start day uses. What you see is what you will get.
  const scheduled: ScheduledBlock[] = layoutDay(anchor, blocks, FIXED_WINDOWS);
  const laidFor = new Map<string, Laid>();
  for (const entry of scheduled) {
    if (entry.kind === 'gap') continue;
    const wait = scheduled.find((other) => other.blockId === `gap:${entry.blockId}`);
    laidFor.set(entry.blockId, {
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      missedWindow: entry.missedWindow,
      waitMinutes: wait ? wait.minutes : 0,
    });
  }

  const last = scheduled[scheduled.length - 1];
  const total = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const over = total - availableMinutes;

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over: target } = event;
    if (!target || active.id === target.id) return;

    const from = blocks.findIndex((block) => block.id === active.id);
    const to = blocks.findIndex((block) => block.id === target.id);
    if (from === -1 || to === -1) return;

    onChange(arrayMove(blocks, from, to));
  };

  const add = (): void => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onChange([
      ...blocks,
      {
        id: `custom:${crypto.randomUUID()}`,
        label: trimmed,
        minutes: 60,
        kind: 'work',
        priority: 0,
      },
    ]);
    setLabel('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between font-mono text-xs text-muted">
        <span>Starts {toHHMM(anchor)}</span>
        {last ? <span>Ends {toHHMM(last.endsAt)}</span> : null}
      </div>

      <div className="border border-edge bg-panel">
        {blocks.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">
            Empty day. Add the first block below, or go back and start from a template.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={blocks.map((block) => block.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocks.map((block) => (
                <Row
                  key={block.id}
                  block={block}
                  laid={laidFor.get(block.id) ?? null}
                  onPatch={(change) =>
                    onChange(
                      blocks.map((entry) =>
                        entry.id === block.id ? { ...entry, ...change } : entry,
                      ),
                    )
                  }
                  onRemove={() => onChange(blocks.filter((entry) => entry.id !== block.id))}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          placeholder="Add a block"
          aria-label="New block name"
          className="min-w-0 flex-1 border border-edge bg-panel px-2 py-1.5 text-sm text-text focus:border-signal focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 border border-edge px-3 py-1.5 text-sm text-muted hover:border-muted hover:text-text"
        >
          Add
        </button>
      </div>

      {/* Named specifically: the feasibility verdict below also says "available", but
          means committable work time, not the length of the day. */}
      <p className={`font-mono text-xs ${over > 0 ? 'text-fail' : 'text-muted'}`}>
        {formatDuration(total)} laid, {formatDuration(availableMinutes)} until day end
        {over > 0 ? ` — over by ${formatDuration(over)}` : ''}
      </p>
    </div>
  );
}
