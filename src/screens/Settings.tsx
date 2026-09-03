import { useRef, useState } from 'react';
import { exportAll, importAll, isBackup } from '../db/repo';
import { NumberField } from '../components/NumberField';
import { TargetEditor } from '../components/TargetEditor';
import { NOTIFICATION_SAMPLES, notifier } from '../lib/notify';
import type { NotificationKey, Prefs } from '../lib/prefs';
import { useDay } from '../store/dayStore';
import { usePrefs } from '../store/prefsStore';

/**
 * Settings — SPEC §4.7. Deliberately small, and behaviour only.
 *
 * The timetable is never here: that is `schedule.config.ts`, edited by committing. If a
 * thing would need to change when the roadmap changes it is config; if it would stay the
 * same it is a setting.
 */
const field =
  'w-full rounded-md border border-edge bg-panel px-3 py-2 font-mono text-sm text-text '
  + 'transition-shadow focus:border-signal focus:shadow-focus focus:outline-none';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  detail,
  on,
  onChange,
}: {
  label: string;
  detail?: string;
  on: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`flex w-full items-center gap-4 rounded-lg border bg-panel px-4 py-3.5 text-left transition-colors ${
        on ? 'border-signal/40' : 'border-edge hover:border-muted'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text">{label}</span>
        {detail ? <span className="mt-0.5 block text-xs text-soft">{detail}</span> : null}
      </span>
      <span
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-xl border transition-colors ${
          on ? 'border-signal bg-signal' : 'border-edge bg-sunk'
        }`}
      >
        <span
          className={`absolute h-4 w-4 rounded-xl bg-panel shadow-card transition-[left] duration-200 ${
            on ? 'left-[21px]' : 'left-[3px]'
          }`}
        />
      </span>
    </button>
  );
}

function Number_({
  label,
  detail,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  detail?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-lg border border-edge bg-panel p-4">
      <span className="block text-sm font-medium text-text">{label}</span>
      {detail ? <span className="mt-0.5 block text-xs text-soft">{detail}</span> : null}
      <NumberField
        value={value}
        onChange={onChange}
        {...(min === undefined ? {} : { min })}
        {...(max === undefined ? {} : { max })}
        step={step}
        label={label}
        className={`${field} mt-2.5`}
      />
    </label>
  );
}

export function Settings({ prefs }: { prefs: Prefs }) {
  const { update, targets, overrides, saveTargets, removeTarget } = usePrefs();
  const { savedTemplates, removeTemplate, load: reloadDay } = useDay();
  const [nonNegotiable, setNonNegotiable] = useState('');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]): void => {
    void update(key, value);
  };

  const download = async (): Promise<void> => {
    const backup = await exportAll();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `cadence-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${backup.days.length} days.`);
  };

  const restore = async (file: File): Promise<void> => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackup(parsed)) {
        setMessage('That file is not a Cadence export.');
        return;
      }
      await importAll(parsed);
      await reloadDay(Date.now());
      setMessage(`Imported ${parsed.days.length} days. Everything else was replaced.`);
    } catch {
      setMessage('That file could not be read.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-7">
      <p className="text-sm text-soft">
        How the app behaves. The timetable lives in config and is changed by committing.
      </p>

      <Section title="Scoring">
        <Toggle
          label="Non-negotiable gate"
          detail="A day cannot be green with a non-negotiable missed, whatever the percentage says."
          on={prefs.nonNegotiableGate}
          onChange={(value) => set('nonNegotiableGate', value)}
        />

        <div className="rounded-lg border border-edge bg-panel px-4 py-3.5">
          <p className="text-sm text-text">Non-negotiables</p>
          <p className="text-xs text-muted">
            Commitment tags or block ids. This list belongs to the current roadmap.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {prefs.nonNegotiables.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  set(
                    'nonNegotiables',
                    prefs.nonNegotiables.filter((entry) => entry !== key),
                  )
                }
                aria-label={`Remove ${key}`}
                className="rounded-md border border-edge px-2.5 py-1 font-mono text-xs text-text transition-colors hover:border-fail hover:text-fail"
              >
                {key} ×
              </button>
            ))}
            {prefs.nonNegotiables.length === 0 ? (
              <span className="text-xs text-muted">None. The gate passes every day.</span>
            ) : null}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              value={nonNegotiable}
              onChange={(event) => setNonNegotiable(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                const key = nonNegotiable.trim();
                if (!key || prefs.nonNegotiables.includes(key)) return;
                set('nonNegotiables', [...prefs.nonNegotiables, key]);
                setNonNegotiable('');
              }}
              placeholder="recall"
              aria-label="Add a non-negotiable"
              className="min-w-0 flex-1 border border-edge bg-ink px-2 py-1 font-mono text-xs text-text focus:border-signal focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Number_
            label="Green threshold"
            value={prefs.greenThreshold}
            min={0}
            max={100}
            onChange={(value) => set('greenThreshold', value)}
          />
          <Number_
            label="Yellow threshold"
            value={prefs.yellowThreshold}
            min={0}
            max={100}
            onChange={(value) => set('yellowThreshold', value)}
          />
        </div>
      </Section>

      <Section title="Planning">
        <Number_
          label="Planning slack"
          detail="Plan to this share of available time. The slack is the plan, not a shortfall."
          value={Math.round(prefs.planningSlack * 100)}
          min={10}
          max={100}
          step={5}
          onChange={(value) => set('planningSlack', value / 100)}
        />

        <label className="block rounded-lg border border-edge bg-panel p-4">
          <span className="block text-sm font-medium text-text">Day starts at</span>
          <span className="mt-0.5 block text-xs text-soft">
            When you actually get up — not when the laptop opens. Start day offers this as
            the anchor, so the morning routine lands in the morning.
          </span>
          <input
            type="time"
            value={prefs.dayStartsAt}
            aria-label="Day starts at"
            onChange={(event) => set('dayStartsAt', event.target.value)}
            className={`${field} mt-2.5`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block rounded-lg border border-edge bg-panel p-4">
            <span className="block text-sm font-medium text-text">Day end</span>
            <span className="mt-0.5 block text-xs text-soft">Capacity is measured to here.</span>
            <input
              type="time"
              value={prefs.dayEnd}
              aria-label="Day end"
              onChange={(event) => set('dayEnd', event.target.value)}
              className={`${field} mt-2.5`}
            />
          </label>
          <Number_
            label="Gym cutoff hour"
            detail="Gym drops if the day starts later."
            value={prefs.gymCutoffHour}
            min={0}
            max={23}
            onChange={(value) => set('gymCutoffHour', value)}
          />
        </div>

        <Number_
          label="Carry-over moves allowed"
          detail="After this many, it is do-it-first or delete."
          value={prefs.maxCarryOverMoves}
          min={1}
          max={10}
          onChange={(value) => set('maxCarryOverMoves', value)}
        />
      </Section>

      <Section title="Weekly targets">
        <p className="text-xs text-muted">
          What Progress paces you against. These start from the roadmap in config and keep
          following it until you change one — only your changes are stored.
        </p>
        <TargetEditor
          targets={targets}
          overrides={overrides}
          onSave={(next) => void saveTargets(next)}
          onRemove={(id) => void removeTarget(id)}
        />
      </Section>

      <Section title="Week shape">
        <div className="grid grid-cols-3 gap-3">
          <Number_
            label="Min green"
            value={prefs.weekShape.minGreen}
            min={0}
            max={7}
            onChange={(value) => set('weekShape', { ...prefs.weekShape, minGreen: value })}
          />
          <Number_
            label="Max yellow"
            value={prefs.weekShape.maxYellow}
            min={0}
            max={7}
            onChange={(value) => set('weekShape', { ...prefs.weekShape, maxYellow: value })}
          />
          <Number_
            label="Max red"
            value={prefs.weekShape.maxRed}
            min={0}
            max={7}
            onChange={(value) => set('weekShape', { ...prefs.weekShape, maxRed: value })}
          />
        </div>
      </Section>

      <Section title="Notifications">
        <button
          type="button"
          onClick={() => void notifier.requestPermission()}
          className="w-full border border-edge px-3 py-2 text-sm text-muted hover:border-muted hover:text-text"
        >
          Allow notifications in this browser
        </button>

        {(Object.keys(NOTIFICATION_SAMPLES) as NotificationKey[]).map((key) => (
          <Toggle
            key={key}
            label={NOTIFICATION_SAMPLES[key].label}
            detail={NOTIFICATION_SAMPLES[key].sample}
            on={prefs.notifications[key]}
            onChange={(value) =>
              set('notifications', { ...prefs.notifications, [key]: value })
            }
          />
        ))}
      </Section>

      <Section title="Saved day templates">
        {savedTemplates.length === 0 ? (
          <p className="text-sm text-muted">
            None yet. Build one from Start day and save it — an OA day, an interview day.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-edge bg-panel">
            {savedTemplates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between gap-3 border-b border-edge px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 text-sm text-text">{template.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {template.blocks.length} blocks
                </span>
                <button
                  type="button"
                  onClick={() => void removeTemplate(template.id)}
                  aria-label={`Delete ${template.name}`}
                  className="shrink-0 border border-edge px-2 py-1 text-xs text-muted hover:border-fail hover:text-fail"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Data">
        <button
          type="button"
          onClick={() => void download()}
          className="w-full border border-edge px-3 py-2.5 text-sm text-text hover:border-muted"
        >
          Export everything to JSON
        </button>

        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restore(file);
            event.target.value = '';
          }}
        />

        {importing ? (
          <div className="border border-fail bg-panel p-3">
            <p className="text-sm text-text">
              Importing replaces everything currently in this browser. There is no undo.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="border border-fail px-3 py-1.5 text-sm text-fail hover:bg-fail/10"
              >
                Choose a file
              </button>
              <button
                type="button"
                onClick={() => setImporting(false)}
                className="rounded-md border border-edge px-3 py-2 text-sm text-text transition-colors hover:bg-sunk"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="w-full border border-edge px-3 py-2.5 text-sm text-muted hover:border-muted hover:text-text"
          >
            Import from JSON
          </button>
        )}

        {message ? <p className="text-xs text-muted">{message}</p> : null}
      </Section>
    </div>
  );
}
