import { useState } from 'react';
import type { TargetType } from '../db/schema';
import { countsToward, knownTags } from '../lib/tags';
import { usePrefs } from '../store/prefsStore';

/**
 * Tag selection, and what it buys you.
 *
 * The tags the roadmap knows about are offered as chips, so a tag that matters cannot be
 * misspelt into silence. Anything else can still be typed — free tags are allowed, they
 * simply count toward nothing, and the line underneath says so rather than leaving it to
 * be discovered on Progress a week later.
 */
interface TagPickerProps {
  tags: string[];
  targetType: TargetType;
  onChange: (tags: string[]) => void;
}

export function TagPicker({ tags, targetType, onChange }: TagPickerProps) {
  const [custom, setCustom] = useState('');
  // The resolved list, so a target the user added offers its tag here too.
  const targets = usePrefs((state) => state.targets);
  const known = knownTags(targets);
  const feeds = countsToward(tags, targetType, targets);

  const extras = tags.filter((tag) => !known.some((entry) => entry.tag === tag));

  const toggle = (tag: string): void =>
    onChange(tags.includes(tag) ? tags.filter((entry) => entry !== tag) : [...tags, tag]);

  const chip = (tag: string, on: boolean, hint: string) => (
    <button
      key={tag}
      type="button"
      onClick={() => toggle(tag)}
      role="checkbox"
      aria-checked={on}
      aria-label={`Tag ${tag}`}
      title={hint}
      className={`border px-2 py-1 font-mono text-xs ${
        on ? 'border-signal text-signal' : 'border-edge text-muted hover:border-muted'
      }`}
    >
      {tag}
    </button>
  );

  return (
    <div>
      <span className="block text-xs text-muted">Counts toward</span>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {known.map((entry) =>
          chip(
            entry.tag,
            tags.includes(entry.tag),
            entry.targets.length > 0 ? entry.targets.join(', ') : 'Not counted by any target',
          ),
        )}
        {extras.map((tag) => chip(tag, true, 'Your own tag — counts toward nothing'))}
      </div>

      <input
        value={custom}
        onChange={(event) => setCustom(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const tag = custom.trim().toLowerCase();
          if (tag && !tags.includes(tag)) onChange([...tags, tag]);
          setCustom('');
        }}
        placeholder="Add your own, then Enter"
        aria-label="Add a tag"
        className="mt-2 w-full border border-edge bg-ink px-2 py-1 font-mono text-xs text-text focus:border-signal focus:outline-none"
      />

      <p className={`mt-1.5 text-xs ${feeds.length > 0 ? 'text-pass' : 'text-muted'}`}>
        {feeds.length > 0
          ? `→ ${feeds.join(', ')}`
          : 'Counts toward no weekly target. That is fine — not everything has to.'}
      </p>
    </div>
  );
}
