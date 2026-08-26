import { useMemo, useState } from 'react';
import { FIXED_WINDOWS } from '../config/schedule.config';
import type { SavedTemplate } from '../db/schema';
import { planDay } from '../engine/capacity';
import { describeDegradation } from '../lib/copy';
import type { Prefs } from '../lib/prefs';
import { blocksForTemplate, suggestedTemplate } from '../lib/templates';
import { toHHMM } from '../lib/time';
import { TemplatePicker } from './TemplatePicker';

/**
 * The unanchored state — SPEC §3.1. The whole screen is Start day plus a template picker.
 *
 * The anchor is the timestamp of the tap. Opening the app after noon without having
 * started prompts for it with a picker defaulting to now: the day is never silently
 * backdated to a morning that did not happen.
 *
 * What the template loses to a late start is shown before anchoring, not after — SPEC §2.4.
 */
interface StartDayProps {
  date: string;
  now: number;
  prefs: Prefs;
  saved: SavedTemplate[];
  planned: boolean;
  onStart: (anchor: Date, templateId: string) => void;
}

const NOON_HOUR = 12;

export function StartDay({ date, now, prefs, saved, planned, onStart }: StartDayProps) {
  const suggested = useMemo(() => suggestedTemplate(new Date(now)), [now]);
  const [templateId, setTemplateId] = useState<string>(suggested);
  const [anchorTime, setAnchorTime] = useState<string>(() => toHHMM(now));

  const afterNoon = new Date(now).getHours() >= NOON_HOUR;

  const anchor = useMemo(() => {
    const parsed = new Date(`${date}T${anchorTime}:00`);
    return Number.isNaN(parsed.getTime()) ? new Date(now) : parsed;
  }, [date, anchorTime, now]);

  const preview = useMemo(() => {
    const template = blocksForTemplate(templateId, saved);
    if (!template) return null;
    const { degradation } = planDay(anchor, template, FIXED_WINDOWS, prefs);
    return describeDegradation(degradation, anchor, prefs.gymCutoffHour);
  }, [templateId, saved, anchor, prefs]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl tracking-display text-text">Day not started</h1>
        <p className="mt-1 text-sm text-muted">
          {planned
            ? 'Planned last night. Anchor it to lay the blocks out.'
            : 'No plan for this day. Anchoring lays the blocks out from now.'}
        </p>
      </header>

      {afterNoon ? (
        <section>
          <label
            htmlFor="anchor-time"
            className="block text-xs uppercase tracking-block text-muted"
          >
            Anchor at
          </label>
          <input
            id="anchor-time"
            type="time"
            value={anchorTime}
            onChange={(event) => setAnchorTime(event.target.value)}
            className="mt-2 w-full border border-edge bg-panel px-3 py-2 font-mono text-lg text-text focus:border-signal focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted">
            Defaults to now. Set it back only to a time you actually started.
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-block text-muted">Template</h2>
        <TemplatePicker
          value={templateId}
          saved={saved}
          onChange={setTemplateId}
          suggested={suggested}
        />
      </section>

      {preview ? (
        <section className="border border-edge bg-panel p-3">
          {preview.map((line) => (
            <p key={line} className="text-sm text-muted first:text-text">
              {line}
            </p>
          ))}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => onStart(anchor, templateId)}
        className="w-full border border-signal bg-signal/10 py-4 font-display text-lg tracking-display text-signal hover:bg-signal/20"
      >
        Start day
      </button>
    </div>
  );
}
