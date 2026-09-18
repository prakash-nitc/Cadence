/**
 * Left from earlier — SPEC §4.1.
 *
 * Unfinished things you added yourself, offered one line each, never pre-ticked. Nothing
 * here enters tomorrow unless you add it; anything left a week lets itself go. Dropping is
 * immediate, with an undo, because the one thing worse than a pile is a click that loses
 * something by accident.
 */
import type { PlanItem } from '../../store/planStore';
import { formatDuration } from '../../lib/time';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/primitives';

const since = (date: string): string =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function Leftovers({
  items,
  letGo,
  days,
  dropped,
  onAdd,
  onDrop,
  onUndo,
}: {
  items: PlanItem[];
  /** Leftovers that waited out the week unpicked. */
  letGo: number;
  days: number;
  /** The last one dropped, while its undo is still on offer. */
  dropped: PlanItem | null;
  onAdd: (key: string) => void;
  onDrop: (item: PlanItem) => void;
  onUndo: () => void;
}) {
  if (items.length === 0 && letGo === 0 && !dropped) return null;

  return (
    <section className="rounded-lg border border-edge bg-sunk/60 p-4" data-leftovers>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-text">Left from earlier</p>
        {items.length > 0 ? (
          <span className="font-mono text-xs text-muted">{items.length} waiting</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Unfinished things you added yourself. None of them is in tomorrow unless you add it.
      </p>

      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-edge overflow-hidden rounded-md border border-edge bg-panel">
          {items.map((item) => {
            // When it was first planned, not the day of its latest copy: how long it has waited.
            const from = item.carriedFrom?.originDate ?? null;
            return (
              <li key={item.key} className="flex items-center gap-3 px-3 py-2" data-leftover={item.label}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{item.label}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted">
                    {from ? `since ${since(from)}` : null}
                    {item.movedCount > 0 ? ` · moved ${item.movedCount}×` : ''}
                    {` · ${formatDuration(item.plannedMinutes)}`}
                  </span>
                </span>
                <Button size="sm" variant="primary" icon="plus" onClick={() => onAdd(item.key)}>
                  Add to tomorrow
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDrop(item)} aria-label={`Drop ${item.label}`}>
                  Drop
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {dropped ? (
        <p className="mt-2.5 flex items-center gap-2 text-xs text-soft" data-dropped>
          <Icon name="trash" size={12} className="text-muted" />
          Dropped “{dropped.label}”.
          <button type="button" onClick={onUndo} className="font-medium text-deep hover:underline">
            Undo
          </button>
        </p>
      ) : null}

      {letGo > 0 ? (
        <p className="mt-2.5 text-xs text-muted" data-let-go>
          <span className="font-mono">{letGo}</span> older {letGo === 1 ? 'one was' : 'ones were'}{' '}
          let go after {days} days unpicked. They stay in your history.
        </p>
      ) : null}
    </section>
  );
}
