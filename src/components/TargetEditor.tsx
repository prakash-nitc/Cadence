import { useState } from 'react';
import { WEEKLY_TARGETS, type WeeklyTarget } from '../config/schedule.config';
import type { TargetOverride } from '../db/schema';
import {
  CUSTOM_SOURCE_KINDS,
  SOURCE_LABEL,
  blankOverride,
  customTarget,
  type CustomSourceKind,
} from '../lib/targets';
import { NumberField } from './NumberField';

/**
 * Editing the weekly targets — SPEC §4.3.
 *
 * Config declares the roadmap's targets; this changes what the user wants changed.
 * Only departures are stored, so a roadmap swap still moves anything untouched.
 *
 * A target's tag is deliberately not editable. The tag is what counts commitments, so
 * changing it would orphan every commitment already carrying the old one — a rename that
 * silently emptied a number. Rename the label freely; to count something differently,
 * hide the target and add a new one.
 */
const field =
  'w-full border border-edge bg-ink px-2 py-1.5 text-sm text-text focus:border-signal focus:outline-none';

interface TargetEditorProps {
  targets: WeeklyTarget[];
  overrides: TargetOverride[];
  onSave: (overrides: TargetOverride[]) => void;
  onRemove: (id: string) => void;
}

export function TargetEditor({ targets, overrides, onSave, onRemove }: TargetEditorProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: '', unit: 'hours', min: 1, tag: '', kind: 'minutesTag' as CustomSourceKind });

  const configIds = new Set(WEEKLY_TARGETS.map((target) => target.id));
  const hidden = overrides.filter((entry) => entry.hidden);

  const overrideFor = (id: string): TargetOverride =>
    overrides.find((entry) => entry.id === id) ??
    blankOverride(id, WEEKLY_TARGETS.findIndex((entry) => entry.id === id));

  const patch = (id: string, change: Partial<TargetOverride>): void =>
    onSave([{ ...overrideFor(id), ...change }]);

  const sourceOf = (target: WeeklyTarget): string => {
    const source = target.source;
    if (!source) return 'not tracked';
    if ('tag' in source) return `tag ${source.tag}`;
    if (source.kind === 'containedBlock') return `block ${source.blockId}`;
    return `sleep ${source.minHours}h+`;
  };

  return (
    <div className="space-y-2">
      <div className="border border-edge bg-panel">
        {targets.map((target) => (
          <div key={target.id} className="border-b border-edge px-3 py-2.5 last:border-b-0">
            <input
              value={target.label}
              onChange={(event) => patch(target.id, { label: event.target.value })}
              aria-label={`${target.label} name`}
              className={field}
            />

            <div className="mt-2 flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="block text-xs text-muted">Min</span>
                <NumberField
                  value={target.min}
                  onChange={(min) => patch(target.id, { min })}
                  min={0}
                  label={`${target.label} minimum`}
                  className="mt-1 w-full border border-edge bg-ink px-2 py-1 text-right font-mono text-xs text-text focus:border-signal focus:outline-none"
                />
              </label>

              <label className="min-w-0 flex-1">
                <span className="block text-xs text-muted">Max</span>
                <NumberField
                  value={target.max ?? target.min}
                  onChange={(max) => patch(target.id, { max })}
                  min={0}
                  label={`${target.label} maximum`}
                  className="mt-1 w-full border border-edge bg-ink px-2 py-1 text-right font-mono text-xs text-text focus:border-signal focus:outline-none"
                />
              </label>

              <label className="min-w-0 flex-1">
                <span className="block text-xs text-muted">Warn below</span>
                <NumberField
                  value={target.warnBelow ?? 0}
                  onChange={(warnBelow) => patch(target.id, { warnBelow })}
                  min={0}
                  label={`${target.label} warning line`}
                  className="mt-1 w-full border border-edge bg-ink px-2 py-1 text-right font-mono text-xs text-text focus:border-signal focus:outline-none"
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  configIds.has(target.id)
                    ? patch(target.id, { hidden: true })
                    : onRemove(target.id)
                }
                aria-label={`Hide ${target.label}`}
                className="shrink-0 border border-edge px-2 py-1.5 text-xs text-muted hover:border-fail hover:text-fail"
              >
                {configIds.has(target.id) ? 'Hide' : 'Delete'}
              </button>
            </div>

            <p className="mt-1 font-mono text-xs text-muted">
              {target.unit} · {sourceOf(target)}
            </p>
          </div>
        ))}
      </div>

      {hidden.length > 0 ? (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs text-muted">Hidden:</span>
          {hidden.map((entry) => {
            const original = WEEKLY_TARGETS.find((target) => target.id === entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() =>
                  configIds.has(entry.id)
                    ? onSave([{ ...entry, hidden: false }])
                    : onRemove(entry.id)
                }
                className="border border-edge px-2 py-1 text-xs text-muted hover:border-muted hover:text-text"
              >
                {entry.label ?? original?.label ?? entry.id} — restore
              </button>
            );
          })}
        </div>
      ) : null}

      {adding ? (
        <div className="border border-edge bg-panel p-3">
          <input
            autoFocus
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            placeholder="What you are tracking"
            aria-label="New target name"
            className={field}
          />

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs text-muted">Per week</span>
              <NumberField
                value={draft.min}
                onChange={(min) => setDraft({ ...draft, min })}
                min={1}
                label="New target minimum"
                className={`${field} mt-1 font-mono`}
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted">Unit</span>
              <input
                value={draft.unit}
                onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
                placeholder="hours"
                aria-label="New target unit"
                className={`${field} mt-1`}
              />
            </label>
          </div>

          <label className="mt-2 block">
            <span className="block text-xs text-muted">Counts commitments tagged</span>
            <input
              value={draft.tag}
              onChange={(event) => setDraft({ ...draft, tag: event.target.value.trim().toLowerCase() })}
              placeholder="coa"
              aria-label="New target tag"
              className={`${field} mt-1 font-mono`}
            />
          </label>

          <div className="mt-2 flex gap-1">
            {CUSTOM_SOURCE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setDraft({ ...draft, kind })}
                className={`flex-1 border px-2 py-1 text-xs ${
                  draft.kind === kind ? 'border-signal text-signal' : 'border-edge text-muted'
                }`}
              >
                {SOURCE_LABEL[kind]}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!draft.label.trim() || !draft.tag}
              onClick={() => {
                onSave([
                  customTarget(
                    draft.label.trim(),
                    draft.unit.trim() || 'units',
                    draft.min,
                    draft.tag,
                    draft.kind,
                    WEEKLY_TARGETS.length + overrides.length,
                  ),
                ]);
                setDraft({ label: '', unit: 'hours', min: 1, tag: '', kind: 'minutesTag' });
                setAdding(false);
              }}
              className="border border-signal px-3 py-1.5 text-sm text-signal hover:bg-signal/10 disabled:opacity-40"
            >
              Add target
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="border border-edge px-3 py-1.5 text-sm text-muted hover:border-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full border border-edge px-3 py-2 text-sm text-muted hover:border-muted hover:text-text"
        >
          Add a target
        </button>
      )}

      <p className="text-xs text-muted">
        Names and numbers are yours. A target’s tag is fixed once set — it is what counts
        your commitments, so changing it would empty the number rather than rename it.
      </p>
    </div>
  );
}
