import { useState } from 'react';
import type { HistoryNote } from '../engine/feasibility';
import type { PlanItem } from '../store/planStore';
import { NumberField } from './NumberField';
import { suggestedSize, type Size, type SizeThresholds } from '../engine/shape';
import { Icon } from './ui/Icon';
import { Button } from './ui/primitives';

/**
 * One line of tomorrow's plan — SPEC §3.4.
 *
 * Pre-selected, with its target already set, so planning is unticking and tweaking
 * rather than composing. Carry-overs carry a move-count badge.
 *
 * At `maxCarryOverMoves` the row stops offering a third move and offers exactly two
 * options instead: do it first tomorrow, or delete it. That is what surfaces avoidance
 * in three days instead of three weeks — SPEC §4.1.
 *
 * Every row can be deleted, not only a stuck one. Unticking and deleting are different
 * things and the row says which is which: unticking means *not tomorrow*, and carried
 * work returns the next night; deleting means *not at all*, and it stops coming back.
 * Deleting carried work asks first, because a record is being retired rather than a
 * suggestion being waved away.
 */
const SIZES: { size: Size; short: string; label: string }[] = [
  { size: 'big', short: 'B', label: 'Big' },
  { size: 'medium', short: 'M', label: 'Medium' },
  { size: 'small', short: 'S', label: 'Small' },
];

interface PlanItemRowProps {
  item: PlanItem;
  first: boolean;
  maxMoves: number;
  note: HistoryNote | null;
  /** Only to seed the size the first time; the choice wins once it is made. */
  thresholds: SizeThresholds;
  onToggle: () => void;
  onTarget: (target: number) => void;
  onMinutes: (minutes: number) => void;
  onSize: (size: Size) => void;
  onDoFirst: () => void;
  onDelete: () => void;
}

export function PlanItemRow({
  item,
  first,
  maxMoves,
  note,
  thresholds,
  onToggle,
  onTarget,
  onMinutes,
  onSize,
  onDoFirst,
  onDelete,
}: PlanItemRowProps) {
  const [confirming, setConfirming] = useState(false);
  const carried = item.source === 'carry';
  /* Seeded from the minutes, then owned by the user — the clock only guesses. */
  const size = item.size ?? suggestedSize(item.plannedMinutes, thresholds);
  const stuck = carried && item.movedCount >= maxMoves;

  return (
    <div className={`px-3 py-2.5 ${first ? '' : 'border-t border-edge'}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          role="checkbox"
          aria-checked={item.selected}
          aria-label={item.label}
          className={`h-4 w-4 shrink-0 border ${
            item.selected ? 'border-signal bg-signal' : 'border-edge'
          }`}
        />

        <span className="min-w-0 flex-1">
          <span className={`block text-sm ${item.selected ? 'text-text' : 'text-muted'}`}>
            {item.label}
            {item.movedCount > 0 ? (
              <span className={`ml-2 font-mono text-xs ${stuck ? 'text-fail' : 'text-warn'}`}>
                moved {item.movedCount}×
              </span>
            ) : null}
          </span>
          {item.detail ? (
            <span className="mt-0.5 block text-xs text-muted">{item.detail}</span>
          ) : null}
        </span>

        {/*
          Big, medium or small — said, not measured. Ninety minutes of reading and ninety
          of a hard new pattern are not the same size of day.
        */}
        <span className="flex shrink-0 overflow-hidden rounded-full border border-edge">
          {SIZES.map(({ size: option, short, label }) => (
            <button
              key={option}
              type="button"
              aria-label={`${item.label} — ${label}`}
              aria-pressed={size === option}
              title={label}
              onClick={() => onSize(option)}
              className={`w-7 py-1 text-center font-mono text-xs transition-colors ${
                size === option
                  ? 'bg-signal font-semibold text-panel'
                  : 'bg-panel text-muted hover:bg-sunk hover:text-text'
              }`}
            >
              {short}
            </button>
          ))}
        </span>

        {item.targetType === 'binary' ? <span className="w-16 shrink-0" aria-hidden /> : null}

        {item.targetType !== 'binary' ? (
          <NumberField
            value={item.target}
            onChange={onTarget}
            min={1}
            label={`${item.label} target`}
            className="w-16 shrink-0 border border-edge bg-ink px-1.5 py-1 text-right font-mono text-xs text-text focus:border-signal focus:outline-none"
          />
        ) : null}

        <NumberField
          value={item.plannedMinutes}
          onChange={onMinutes}
          min={0}
          label={`${item.label} weight`}
          className="w-16 shrink-0 border border-edge bg-ink px-1.5 py-1 text-right font-mono text-xs text-muted focus:border-signal focus:outline-none"
        />

        <button
          type="button"
          aria-label={`Delete ${item.label}`}
          title={
            carried
              ? 'Drop it for good — it stops being carried forward'
              : 'Remove it from tomorrow'
          }
          onClick={() => (carried ? setConfirming(true) : onDelete())}
          className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-fail/10 hover:text-fail"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      {confirming ? (
        <div className="mt-2 rounded-md border border-fail/40 bg-fail/5 px-3 py-2.5">
          <p className="text-xs text-text">
            Drop <span className="font-medium">{item.label}</span> for good? It has been
            carried {item.movedCount === 0 ? 'once' : `${item.movedCount + 1} times`} and
            will stop being offered.
          </p>
          <p className="mt-1 text-xs text-muted">
            Unticking instead keeps it in the pool for another night. Nothing already
            scored changes either way.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button
              size="sm"
              variant="danger"
              icon="trash"
              onClick={() => {
                onDelete();
                setConfirming(false);
              }}
            >
              Drop it
            </Button>
            <Button size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {stuck ? (
        <div className="mt-2 border border-fail bg-fail/5 px-2 py-2">
          <p className="text-xs text-fail">
            Moved {item.movedCount} times. Do it first tomorrow, or delete it.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onDoFirst}
              className="border border-fail px-2 py-1 text-xs text-fail hover:bg-fail/10"
            >
              Do it first
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="border border-edge px-2 py-1 text-xs text-muted hover:border-muted hover:text-text"
            >
              Delete it
            </button>
          </div>
        </div>
      ) : null}

      {note ? (
        <p className="mt-1 font-mono text-xs text-muted">
          {note.target} {note.tag}. You have hit {note.target}+ {note.hits}{' '}
          {note.hits === 1 ? 'time' : 'times'} in {note.days} days.
        </p>
      ) : null}
    </div>
  );
}
