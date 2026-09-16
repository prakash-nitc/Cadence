/**
 * The morning card's settings — SPEC §3.6.
 *
 * Your own quotes and affirmations, which join the rotation, and the favourites that come
 * back more often. Your own entries are stored only on this laptop, so they can be any
 * line you care about, word for word.
 */
import { useEffect, useState } from 'react';
import type { MorningEntry } from '../content/morning';
import { creditLine } from '../engine/morning';
import { entryById, useMorning } from '../store/morningStore';
import { Icon } from './ui/Icon';
import { Button } from './ui/primitives';

const FIELD =
  'w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted focus:border-signal focus:shadow-focus focus:outline-none';

function EntryRow({
  entry,
  onRemove,
  removeLabel,
}: {
  entry: MorningEntry;
  onRemove: () => void;
  removeLabel: string;
}) {
  const credit = creditLine(entry);
  return (
    <div className="flex items-start gap-3 border-b border-edge px-3 py-2.5 last:border-b-0">
      <span className="mt-0.5 shrink-0 rounded-full bg-sunk px-2 py-0.5 text-[11px] text-soft">
        {entry.kind === 'quote' ? 'Quote' : 'Affirmation'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-text">{entry.text}</span>
        {credit ? <span className="mt-0.5 block text-xs text-muted">— {credit}</span> : null}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${removeLabel}: ${entry.text}`}
        className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-fail/10 hover:text-fail"
      >
        <Icon name={removeLabel === 'Unstar' ? 'starFilled' : 'trash'} size={14} />
      </button>
    </div>
  );
}

export function MorningSettings({ now }: { now: number }) {
  const { loaded, load, own, favourites, addOwn, removeOwn, toggleFavourite } = useMorning();
  const [kind, setKind] = useState<MorningEntry['kind']>('quote');
  const [text, setText] = useState('');
  const [by, setBy] = useState('');

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const starred = [...favourites]
    .map((id) => entryById(own, id))
    .filter((entry): entry is MorningEntry => entry !== null);

  const add = (): void => {
    if (!text.trim()) return;
    void addOwn({ kind, text, by }, now);
    setText('');
    setBy('');
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-edge bg-panel p-4">
        <p className="text-sm font-medium text-text">Add your own</p>
        <p className="mt-0.5 text-xs text-muted">
          Joins the daily rotation. Paste any line you care about, word for word — it stays on
          this laptop.
        </p>

        <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Entry kind">
          {(['quote', 'affirmation'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => setKind(option)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                kind === option
                  ? 'border-signal bg-wash text-deep'
                  : 'border-edge text-soft hover:border-signal/40'
              }`}
            >
              {option === 'quote' ? 'Quote' : 'Affirmation'}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          aria-label="Entry text"
          placeholder={
            kind === 'quote'
              ? 'A line that gets you moving'
              : 'I … — first person, present tense'
          }
          className={`${FIELD} mt-3 resize-y`}
        />

        {kind === 'quote' ? (
          <input
            value={by}
            onChange={(event) => setBy(event.target.value)}
            aria-label="Who said it"
            placeholder="Who said it — optional"
            className={`${FIELD} mt-2`}
          />
        ) : null}

        <div className="mt-3">
          <Button variant="primary" icon="plus" onClick={add} disabled={!text.trim()}>
            Add to rotation
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted">
          Yours <span className="font-mono">{own.length}</span>
        </p>
        {own.length === 0 ? (
          <p className="text-sm text-soft">None yet. Anything you add shows up on a morning soon.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-edge bg-panel" data-own-entries>
            {own.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                removeLabel="Delete"
                onRemove={() => void removeOwn(entry.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs text-muted">
          Favourites <span className="font-mono">{starred.length}</span> — star any card on Now;
          favourites come back about one morning in three.
        </p>
        {starred.length === 0 ? (
          <p className="text-sm text-soft">None starred yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-edge bg-panel" data-favourites>
            {starred.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                removeLabel="Unstar"
                onRemove={() => void toggleFavourite(entry.id, now)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
