/**
 * The page header — §6 of the redesign brief.
 *
 * Left: where you are and what today is. Right: the actions that belong to the app rather
 * than to a screen. Deliberately short — it is chrome above the content, and every pixel
 * it takes is one the day timeline does not get.
 *
 * No search box and no profile: one user, one machine, and nothing to search that is not
 * already on screen. §6 lists them as options, not requirements.
 */
import { format } from 'date-fns';
import type { ReactNode } from 'react';
import { Icon } from './ui/Icon';

const GREETINGS: [number, string][] = [
  [5, 'Good morning'],
  [12, 'Good afternoon'],
  [17, 'Good evening'],
];

/** The greeting for an hour. Late night gets its own, rather than rounding to morning. */
export function greetingFor(now: number): string {
  const hour = new Date(now).getHours();
  if (hour < 5) return 'Late night';
  let greeting = 'Good evening';
  for (const [from, text] of GREETINGS) if (hour >= from) greeting = text;
  return greeting;
}

export function Header({
  title,
  subtitle,
  now,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  now: number;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-edge bg-ink px-8 py-5">
      <div className="min-w-0">
        <h1 className="truncate font-display text-xl font-semibold tracking-display text-text">
          {title}
        </h1>
        {subtitle ? <div className="mt-0.5 text-sm text-soft">{subtitle}</div> : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="flex items-center gap-2 rounded-md border border-edge bg-panel px-3 py-2 text-xs text-soft">
          <Icon name="calendar" size={14} className="text-muted" />
          <span className="font-mono">{format(now, 'EEE d MMM')}</span>
        </span>
        {actions}
      </div>
    </header>
  );
}
