/**
 * The morning card — SPEC §3.6.
 *
 * A quote, an affirmation, and the first real piece of work today. The first two are the
 * user's own request and the only place the app speaks in an encouraging voice; they sit in
 * their own card, credited, and never on a score, a band or a missed commitment. The third
 * is what stops the first two fading by ten o'clock: it points them at something.
 *
 * Opens full in the morning and folds to a single line once the first block has started,
 * so it is there when the day begins and out of the way while the day is worked.
 */
import { useState } from 'react';
import type { MorningEntry } from '../../content/morning';
import { creditLine, type FirstThing } from '../../engine/morning';
import { formatDuration } from '../../lib/time';
import { Icon } from '../ui/Icon';

const SIZE_WORD = { big: 'Big', medium: 'Medium', small: 'Small' } as const;

export function MorningCard({
  date,
  quote,
  affirmation,
  first,
  favourites,
  folded: foldedAtFirst,
  onFavourite,
}: {
  date: string;
  quote: MorningEntry | null;
  affirmation: MorningEntry | null;
  first: FirstThing | null;
  favourites: ReadonlySet<string>;
  /** Folded by default once the day's first block has started. */
  folded: boolean;
  onFavourite: (id: string) => void;
}) {
  const [folded, setFolded] = useState(foldedAtFirst);
  if (!quote && !affirmation) return null;

  const heading = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  // A plain function rather than a nested component, so it is not remounted every render.
  // Filled ink rather than a status colour: amber and green already mean things here.
  const star = (entry: MorningEntry) => {
    const on = favourites.has(entry.id);
    return (
      <button
        type="button"
        onClick={() => onFavourite(entry.id)}
        aria-pressed={on}
        aria-label={on ? 'Remove from favourites' : 'Add to favourites'}
        title="Favourites come back more often"
        className={`shrink-0 rounded-full p-1.5 transition-colors hover:bg-sunk ${
          on ? 'text-text' : 'text-muted hover:text-text'
        }`}
      >
        <Icon name={on ? 'starFilled' : 'star'} size={15} />
      </button>
    );
  };

  if (folded) {
    const line = affirmation ?? quote;
    return (
      <section className="card flex items-center gap-3 px-5 py-3" data-morning="folded">
        <Icon name="sparkle" size={14} className="shrink-0 text-signal" />
        <p className="min-w-0 flex-1 truncate text-sm text-soft">{line?.text}</p>
        <button
          type="button"
          onClick={() => setFolded(false)}
          className="shrink-0 text-xs text-muted hover:text-text"
        >
          Show
        </button>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden" data-morning="open">
      <div className="flex items-center justify-between gap-3 border-b border-edge px-6 py-3">
        <p className="eyebrow flex items-center gap-2">
          <Icon name="sparkle" size={13} className="text-signal" />
          {heading}
        </p>
        <button
          type="button"
          onClick={() => setFolded(true)}
          className="text-xs text-muted hover:text-text"
        >
          Fold
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {quote ? (
          <figure className="px-6 py-6" data-morning-quote>
            <div className="flex items-start gap-3">
              <blockquote className="min-w-0 flex-1 font-display text-xl leading-snug tracking-display text-text">
                {quote.text}
              </blockquote>
              {star(quote)}
            </div>
            {creditLine(quote) ? (
              <figcaption className="mt-3 text-sm text-soft">
                — {creditLine(quote)}
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        <div className="space-y-5 border-t border-edge bg-sunk/60 px-6 py-6 lg:border-l lg:border-t-0">
          {affirmation ? (
            <div data-morning-affirmation>
              <p className="eyebrow">Today&apos;s affirmation</p>
              <div className="mt-2 flex items-start gap-2">
                <p className="min-w-0 flex-1 text-base font-medium text-text">{affirmation.text}</p>
                {star(affirmation)}
              </div>
            </div>
          ) : null}

          <div data-morning-first>
            <p className="eyebrow">First thing</p>
            {first ? (
              <p className="mt-2 text-sm text-text">
                <span className="font-medium">{first.label}</span>
                <span className="ml-2 font-mono text-xs text-muted">
                  {SIZE_WORD[first.size]} · {formatDuration(first.minutes)}
                </span>
                <span className="mt-1 block text-soft">Do this one before anything else.</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-soft">
                Nothing committed yet. Decide the one thing today is for.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
