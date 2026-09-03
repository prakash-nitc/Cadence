/**
 * User-facing prose that is derived from engine output.
 *
 * Copy discipline — CLAUDE.md rule 7: active voice, sentence case, no exclamation
 * marks. Errors state what happened. Empty states say what to do. The app does not
 * console and does not scold.
 *
 * Kept out of `engine/` so the engines stay value-in, value-out.
 */
import type { Cut, Degradation } from '../engine/capacity';
import type { Verdict } from '../engine/feasibility';
import { formatDuration, toHHMM } from './time';

const list = (items: string[]): string => items.join(', ');

/**
 * The Start day confirmation — SPEC §2.4. States facts and stops.
 *
 * > Anchored at 09:20. Capacity 13h 25m against a 17h template.
 * > Dropping: Flex, Second DSA pass, Decompress, Tea.
 * > Gym dropped — the day started after 09:00.
 * > Protected work intact.
 */
export function describeDegradation(
  degradation: Degradation,
  anchor: Date,
  gymCutoffHour: number,
): string[] {
  const { cuts, templateMinutes, availableMinutes, shortfallMinutes } = degradation;
  const lines: string[] = [
    `Anchored at ${toHHMM(anchor)}. Capacity ${formatDuration(availableMinutes)} against a ${formatDuration(templateMinutes)} template.`,
  ];

  const dropped = cuts.filter(
    (cut): cut is Extract<Cut, { kind: 'dropped' }> =>
      cut.kind === 'dropped' && cut.reason !== 'gymCutoff',
  );
  if (dropped.length > 0) {
    lines.push(`Dropping: ${list(dropped.map((cut) => cut.label))}.`);
  }

  for (const cut of cuts) {
    if (cut.kind === 'dropped' && cut.reason === 'gymCutoff') {
      lines.push(`${cut.label} dropped — the day started after ${String(gymCutoffHour).padStart(2, '0')}:00.`);
    }
  }

  for (const cut of cuts) {
    if (cut.kind === 'compressed') {
      lines.push(`${cut.label} cut to ${formatDuration(cut.to)}.`);
    }
  }

  const compressedProtected = cuts.some((cut) => cut.kind === 'compressed' && isProtected(cut.blockId, degradation));
  if (cuts.length > 0 && !compressedProtected) {
    lines.push('Protected work intact.');
  }

  if (shortfallMinutes > 0) {
    lines.push(
      `Still ${formatDuration(shortfallMinutes)} over capacity. Protected work is held at its floor and the day runs past the soft end.`,
    );
  }

  return lines;
}

function isProtected(blockId: string, degradation: Degradation): boolean {
  return degradation.blocks.some((block) => block.id === blockId && block.priority === 0);
}

/** "22 min free until Spring Boot." — SPEC §2.3. Shown, never silently closed. */
export function freeTimeLine(minutes: number, nextLabel: string): string {
  return `${formatDuration(minutes)} free until ${nextLabel}.`;
}

/** The warning on `Start next block early`. Default answer is no. */
export function pullForwardWarning(minutes: number): string {
  return `Moves every remaining boundary earlier by ${formatDuration(minutes)}.`;
}

/** One rule per day, rotating deterministically so the same day always shows the same one. */
export function ruleForDate(rules: string[], date: string): string {
  if (rules.length === 0) return '';
  const days = Math.floor(Date.parse(`${date}T00:00:00`) / 86_400_000);
  return rules[((days % rules.length) + rules.length) % rules.length] ?? '';
}

/**
 * The verdict shown before a plan can be saved — SPEC §4.2.
 *
 * > 7h 10m committed against 8h 30m available. Within slack.
 *
 * States the position and stops. Exceeding the slack warns; it never blocks.
 */
export function verdictLine(verdict: Verdict): string {
  const head = `${formatDuration(verdict.committedMinutes)} committed against ${formatDuration(verdict.availableMinutes)} available.`;

  if (verdict.status === 'within') return `${head} Within slack.`;
  if (verdict.status === 'overSlack') return `${head} Past the slack line.`;
  return `${head} Over capacity.`;
}

/**
 * The line under the greeting on Now — §6 of the redesign brief, minus the cheerleading.
 *
 * States where the day actually stands and nothing else. "Let's make today count" is the
 * thing this must never say: the app does not encourage and does not scold (rule 7), and
 * a status line that is the same every morning stops being read by the second week.
 *
 * Pure. Everything it needs is passed in.
 */
export function dayStatusLine(input: {
  anchored: boolean;
  complete: boolean;
  earnedMinutes: number;
  committedMinutes: number;
  runningLabel: string | null;
}): string {
  const { anchored, complete, earnedMinutes, committedMinutes, runningLabel } = input;

  if (!anchored) return 'No day laid out yet. Start it below.';
  if (complete) return 'Every block marked. Log it on Plan.';
  if (committedMinutes === 0) {
    return runningLabel
      ? `${runningLabel} is running, with nothing committed to today.`
      : 'Nothing committed to today.';
  }

  const percent = Math.round((earnedMinutes / committedMinutes) * 100);
  const done = `${percent}% of today\u2019s committed minutes done`;
  return runningLabel ? `${runningLabel} \u00b7 ${done}` : done;
}

export interface BackupState {
  /** Whole days since the last export, or null if there has never been one. */
  daysSince: number | null;
  overdue: boolean;
  line: string;
}

/**
 * How the backup reminder reads — pure, so the clock is passed in.
 *
 * Deliberately not alarming. It states a fact and offers the action; a local-only app
 * nagging about data loss every session would be the sort of thing the user turns off,
 * and then it protects nothing.
 */
export function backupState(
  lastBackupAt: number | null,
  reminderDays: number,
  now: number,
): BackupState {
  if (reminderDays <= 0) {
    return { daysSince: null, overdue: false, line: 'Backup reminders are off.' };
  }

  if (lastBackupAt === null) {
    return {
      daysSince: null,
      overdue: true,
      line: 'Never exported. Everything lives in this browser only.',
    };
  }

  const daysSince = Math.floor((now - lastBackupAt) / 86_400_000);
  const overdue = daysSince >= reminderDays;

  return {
    daysSince,
    overdue,
    line:
      daysSince === 0
        ? 'Exported today.'
        : `Last exported ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago.`,
  };
}
