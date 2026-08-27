import type { HistoryNote } from '../engine/feasibility';
import type { PlanItem } from '../store/planStore';

/**
 * One line of tomorrow's plan — SPEC §3.4.
 *
 * Pre-selected, with its target already set, so planning is unticking and tweaking
 * rather than composing. Carry-overs carry a move-count badge.
 *
 * At `maxCarryOverMoves` the row stops offering a third move and offers exactly two
 * options instead: do it first tomorrow, or delete it. That is what surfaces avoidance
 * in three days instead of three weeks — SPEC §4.1.
 */
interface PlanItemRowProps {
  item: PlanItem;
  first: boolean;
  maxMoves: number;
  note: HistoryNote | null;
  onToggle: () => void;
  onTarget: (target: number) => void;
  onMinutes: (minutes: number) => void;
  onDoFirst: () => void;
  onDelete: () => void;
}

export function PlanItemRow({
  item,
  first,
  maxMoves,
  note,
  onToggle,
  onTarget,
  onMinutes,
  onDoFirst,
  onDelete,
}: PlanItemRowProps) {
  const stuck = item.source === 'carry' && item.movedCount >= maxMoves;

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

        {item.targetType === 'binary' ? <span className="w-16 shrink-0" aria-hidden /> : null}

        {item.targetType !== 'binary' ? (
          <label className="shrink-0">
            <span className="sr-only">{item.label} target</span>
            <input
              type="number"
              min="1"
              value={item.target}
              onChange={(event) => onTarget(Math.max(1, Number(event.target.value) || 1))}
              aria-label={`${item.label} target`}
              className="w-16 border border-edge bg-ink px-1.5 py-1 text-right font-mono text-xs text-text focus:border-signal focus:outline-none"
            />
          </label>
        ) : null}

        <label className="shrink-0">
          <span className="sr-only">{item.label} weight</span>
          <input
            type="number"
            min="0"
            value={item.plannedMinutes}
            onChange={(event) => onMinutes(Math.max(0, Number(event.target.value) || 0))}
            aria-label={`${item.label} weight`}
            className="w-16 border border-edge bg-ink px-1.5 py-1 text-right font-mono text-xs text-muted focus:border-signal focus:outline-none"
          />
        </label>
      </div>

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
              onClick={onDelete}
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
