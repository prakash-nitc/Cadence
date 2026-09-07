/**
 * Today's brain dump, on the screen you actually look at.
 *
 * It was written the night before on Plan and then never seen again, which makes it a
 * note to nobody. What tomorrow was *for* belongs in front of you on the morning it
 * became today.
 *
 * Editable here as well as there: a thought that arrives at eleven is worth catching, and
 * making the user go to another screen to catch it means it does not get caught.
 */
import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/primitives';

export function TodayNote({
  note,
  onSave,
}: {
  note: string;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(note);
  }, [note]);

  const empty = note.trim().length === 0;

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow flex items-center gap-2">
          <Icon name="bookmark" size={13} />
          What today is for
        </p>
        {!editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {empty ? 'Add' : 'Edit'}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <>
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
            }}
            rows={4}
            aria-label="What today is for"
            placeholder="The thing that would make today count."
            className="mt-3 w-full resize-y rounded-md border border-edge bg-panel px-3 py-2 text-sm leading-relaxed text-text transition-shadow placeholder:text-muted focus:border-signal focus:shadow-focus focus:outline-none"
          />
          <div className="mt-2.5 flex gap-2">
            <Button
              size="sm"
              variant="primary"
              icon="check"
              onClick={() => {
                onSave(draft.trim());
                setSaved(true);
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDraft(note);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : empty ? (
        <p className="mt-2 text-sm text-soft">
          Nothing written for today. It is the first thing on Plan the night before.
        </p>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text">{note}</p>
      )}

      {saved && !editing ? <p className="mt-2 text-xs text-muted">Saved.</p> : null}
    </section>
  );
}
