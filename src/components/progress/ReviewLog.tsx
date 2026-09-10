/**
 * The nightly review, kept — SPEC §3.4.
 *
 * You write three lines every night and the app showed you one of them once, the next
 * morning. Listed together with their dates, a repeated failure mode becomes visible: the
 * same sentence three weeks running is the most useful thing this screen can show.
 *
 * Deliberately no clustering or "4 of the last 7 mention the afternoon". Grouping these
 * by meaning needs to read them, and a wrong grouping is worse than none — the list makes
 * the pattern visible without the app claiming to have spotted it.
 */
import { useState } from 'react';
import type { LogRecord } from '../../db/schema';
import { Icon, type IconName } from '../ui/Icon';
import { Button, Panel } from '../ui/primitives';

type Field = 'wentWrong' | 'toImprove' | 'wentWell' | 'hardestThing';

const FIELDS: { field: Field; label: string; icon: IconName }[] = [
  { field: 'wentWrong', label: 'Where it went wrong', icon: 'alert' },
  { field: 'toImprove', label: 'To improve', icon: 'target' },
  { field: 'wentWell', label: 'What went well', icon: 'check' },
  { field: 'hardestThing', label: 'Hardest thing', icon: 'bolt' },
];

const SHOWN = 8;

const shortDate = (iso: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function ReviewLog({ logs }: { logs: LogRecord[] }) {
  const [field, setField] = useState<Field>('wentWrong');
  const [all, setAll] = useState(false);

  const written = logs
    .filter((log) => (log[field] ?? '').trim().length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  const shown = all ? written : written.slice(0, SHOWN);
  const active = FIELDS.find((entry) => entry.field === field);

  return (
    <Panel
      title="What you wrote"
      icon="plan"
      action={
        <span className="inline-flex rounded-full border border-edge p-0.5">
          {FIELDS.map(({ field: option, label, icon }) => (
            <button
              key={option}
              type="button"
              aria-pressed={field === option}
              aria-label={label}
              title={label}
              onClick={() => {
                setField(option);
                setAll(false);
              }}
              className={`rounded-full px-2 py-1 transition-colors ${
                field === option
                  ? 'bg-wash text-deep'
                  : 'text-muted hover:bg-sunk hover:text-text'
              }`}
            >
              <Icon name={icon} size={13} />
            </button>
          ))}
        </span>
      }
    >
      <p className="-mt-2 mb-3 text-xs text-muted">{active?.label}</p>

      {written.length === 0 ? (
        <p className="text-sm text-soft">
          Nothing written under this yet. It is the last thing on Plan each night.
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {shown.map((log) => (
              <li key={log.date} className="flex gap-3">
                <span className="w-14 shrink-0 pt-px font-mono text-xs text-muted">
                  {shortDate(log.date)}
                </span>
                <span className="min-w-0 text-sm leading-relaxed text-text">
                  {log[field]}
                </span>
              </li>
            ))}
          </ul>

          {written.length > SHOWN ? (
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${written.length}`}
            </Button>
          ) : null}
        </>
      )}
    </Panel>
  );
}
