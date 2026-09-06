/**
 * Sleep and energy, recorded when they are actually known.
 *
 * Both were only reachable from Plan, which is filled at 23:00 — by which point how you
 * slept is a recollection and how you felt at nine in the morning is a reconstruction.
 * The night review still owns the rest of the log and can correct either of these; this
 * is about catching them while they are facts rather than estimates.
 *
 * Writes straight through: energy on click, sleep on blur. Nothing to submit, because a
 * two-field form with a save button is a form people stop filling in.
 */
import { useEffect, useState } from 'react';
import type { LogRecord } from '../../db/schema';
import { NumberField } from '../NumberField';
import { Icon } from '../ui/Icon';
import type { Tone } from '../ui/primitives';

const LEVELS = [1, 2, 3, 4, 5] as const;

/** What each level means, so the number is a judgement rather than a mood ring. */
const MEANING: Record<number, string> = {
  1: 'running on empty',
  2: 'flat',
  3: 'ordinary',
  4: 'sharp',
  5: 'the good kind of day',
};

export function MorningCheck({
  log,
  lastSleep,
  onSave,
}: {
  log: LogRecord | null;
  /** Last night's figure, to seed the field rather than starting from nothing. */
  lastSleep: number | null;
  onSave: (sleepHours: number, energy: LogRecord['energy']) => void;
}) {
  const [sleep, setSleep] = useState<number>(log?.sleepHours ?? lastSleep ?? 7);
  const [energy, setEnergy] = useState<LogRecord['energy'] | null>(log?.energy ?? null);

  // Follow the stored log once it arrives, or once the night review changes it.
  useEffect(() => {
    if (log) {
      setSleep(log.sleepHours);
      setEnergy(log.energy);
    }
  }, [log]);

  const recorded = energy !== null;
  const tone: Tone = recorded ? 'pass' : 'neutral';

  return (
    <section
      className={`rounded-lg border p-5 transition-colors ${
        recorded ? 'border-edge bg-panel' : 'border-signal/35 bg-wash'
      }`}
    >
      <p className={`eyebrow flex items-center gap-2 ${recorded ? '' : 'text-deep'}`}>
        <Icon name={recorded ? 'check' : 'moon'} size={13} />
        {recorded ? 'Slept and starting' : 'Before you begin'}
      </p>

      <div className="mt-3">
        <label className="block">
          <span className="text-xs text-muted">Sleep last night</span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <NumberField
              value={sleep}
              onChange={(hours) => {
                setSleep(hours);
                if (energy !== null) onSave(hours, energy);
              }}
              min={0}
              max={16}
              step={0.5}
              label="Sleep last night"
              className="w-24 rounded-md border border-edge bg-panel px-3 py-2 font-mono text-lg text-text transition-shadow focus:border-signal focus:shadow-focus focus:outline-none"
            />
            <span className="text-sm text-soft">hours</span>
          </div>
        </label>
      </div>

      <div className="mt-4">
        <span className="text-xs text-muted">Energy</span>
        <div className="mt-1.5 flex gap-1.5">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-label={`Energy ${level}`}
              aria-pressed={energy === level}
              title={MEANING[level]}
              onClick={() => {
                setEnergy(level);
                onSave(sleep, level);
              }}
              className={`flex-1 rounded-md border py-2 font-mono text-sm transition-colors ${
                energy === level
                  ? 'border-signal bg-signal font-semibold text-panel'
                  : 'border-edge bg-panel text-soft hover:border-muted'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <p className={`mt-3 text-xs ${tone === 'pass' ? 'text-muted' : 'text-soft'}`}>
        {recorded
          ? `${MEANING[energy] ?? ''}. Correct it tonight if the day says otherwise.`
          : 'Saved as you tap. The night review can still change it.'}
      </p>
    </section>
  );
}
