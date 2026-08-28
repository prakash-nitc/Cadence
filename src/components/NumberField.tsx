import { useEffect, useState } from 'react';

/**
 * A number input you can actually type into.
 *
 * The obvious implementation — `Math.max(min, Number(event.target.value) || fallback)`
 * on every keystroke — makes the field unusable: clearing it to type a new value parses
 * "" as zero, the clamp rewrites it to the minimum, and you end up typing around a digit
 * you never asked for. Every number field in the app had that bug.
 *
 * So the raw text is held while editing and only clamped on blur. The parsed value is
 * still reported as you type, so live readouts follow along; it is only the *correction*
 * that waits until you have finished.
 */
interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}

export function NumberField({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  label,
  className = '',
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  // Follow the value from outside — a reorder, a template swap — but never while the
  // field is being typed into, or it would fight the user for the caret.
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const clamp = (next: number): number => {
    const lower = Math.max(min, next);
    return max === undefined ? lower : Math.min(max, lower);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      {...(max === undefined ? {} : { max })}
      step={step}
      value={draft}
      aria-label={label}
      onFocus={() => setEditing(true)}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        // Report what has been typed so far, uncorrected, so readouts stay live.
        if (raw !== '' && Number.isFinite(Number(raw))) onChange(Number(raw));
      }}
      onBlur={() => {
        setEditing(false);
        const parsed = Number(draft);
        const settled = draft === '' || !Number.isFinite(parsed) ? clamp(value) : clamp(parsed);
        setDraft(String(settled));
        if (settled !== value) onChange(settled);
      }}
      className={className}
    />
  );
}
