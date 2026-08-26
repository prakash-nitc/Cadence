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
