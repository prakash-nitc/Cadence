/**
 * Time helpers. Pure — no `Date.now()` lives here, callers pass the clock in.
 *
 * Wall-clock strings ('HH:mm') only ever come from `schedule.config.ts` (mess windows)
 * or from a stored preference (`dayEnd`). Nothing else in the app is allowed to name
 * a clock time — SPEC §0.2.
 */
import {
  addDays as fnsAddDays,
  addMinutes as fnsAddMinutes,
  differenceInMinutes,
  format,
  startOfDay,
} from 'date-fns';

export const MINUTE_MS = 60_000;

/** 'HH:mm' -> minutes since midnight. Throws on malformed input rather than guessing. */
export function parseHHMM(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`Malformed time: ${hhmm}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Time out of range: ${hhmm}`);
  return hours * 60 + minutes;
}

export function toHHMM(at: Date | number): string {
  return format(at, 'HH:mm');
}

/** Resolve a wall-clock string against the calendar day that `on` falls in. */
export function atTimeOn(on: Date | number, hhmm: string): Date {
  return fnsAddMinutes(startOfDay(on), parseHHMM(hhmm));
}

export function addMinutes(at: Date | number, minutes: number): Date {
  return fnsAddMinutes(at, minutes);
}

export function addDays(at: Date | number, days: number): Date {
  return fnsAddDays(at, days);
}

export function minutesBetween(from: Date | number, to: Date | number): number {
  return differenceInMinutes(to, from);
}

/** 'YYYY-MM-DD' — the primary key for a day. Local calendar date, never UTC. */
export function dateKey(at: Date | number): string {
  return format(at, 'yyyy-MM-dd');
}

/** '1h 40m' / '45m' / '0m'. Used for every duration the user reads. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
