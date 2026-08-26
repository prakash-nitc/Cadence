/**
 * Day scoring — SPEC §4.1. The core of the app.
 *
 * Blocks are time containers; commitments are what actually got finished. The gap
 * between the two is where days go wrong, so the score is computed from commitments
 * and never from block time.
 *
 *   weight     = plannedMinutes
 *   completion = clamp(done / target, 0, 1)
 *   dayScore   = Σ(weight × completion) / Σ(weight)   over non-displaced commitments
 *
 * Nothing here is fudged — CLAUDE.md rule 4. Weight is planned minutes and nothing else.
 * Non-negotiables are a separate pass/fail gate, never an inflated weight. Displaced
 * commitments leave both sides of the ratio. If a change here makes a band feel better,
 * it is wrong.
 *
 * Pure: no I/O, no clock.
 */
import type { Band, CommitmentRecord } from '../db/schema';
import type { Prefs } from '../lib/prefs';

/** The subset of a commitment scoring actually reads. */
export type Scorable = Pick<
  CommitmentRecord,
  'blockId' | 'done' | 'target' | 'plannedMinutes' | 'status' | 'tags'
>;

export interface ScoreResult {
  /**
   * 0–100, or null when there is nothing to score: the day was never planned, or every
   * commitment on it was displaced. A null score is not a zero — SPEC §4.6 is explicit
   * that a day spent in an interview must not render as a lapse in discipline.
   */
  score: number | null;
  /** Null only when a planned day had every commitment displaced. */
  band: Band | null;
  gatePassed: boolean;
  /** Non-negotiable keys that did not pass, in `prefs.nonNegotiables` order. */
  failedGates: string[];
  /** Σ weight over the commitments in the denominator. */
  weight: number;
  /** Σ weight × completion. */
  earned: number;
  scored: number;
  displaced: number;
}

/**
 * Partial credit, clamped. A skipped or avoided commitment scores zero regardless of
 * what was logged against it — it stays in the denominator, contributing nothing.
 */
export function completionOf(commitment: Scorable): number {
  if (commitment.status === 'skipped' || commitment.status === 'avoided') return 0;
  if (commitment.target <= 0) return 0;
  return Math.min(1, Math.max(0, commitment.done / commitment.target));
}

export function isDropped(commitment: Scorable): boolean {
  return (
    commitment.status === 'skipped' ||
    commitment.status === 'avoided' ||
    commitment.status === 'displaced'
  );
}

/** A non-negotiable is named by a commitment tag or by a block id — SPEC §4.1. */
function matches(commitment: Scorable, key: string): boolean {
  return commitment.tags.includes(key) || commitment.blockId === key;
}

interface GateResult {
  passed: boolean;
  failed: string[];
}

/**
 * The gate — scored separately, pass/fail, so cheap non-negotiables stay visible without
 * inflating their weight and corrupting the arithmetic.
 *
 * A non-negotiable that was displaced is excused rather than failed: displacement removes
 * a commitment from scoring entirely, and §4.6 requires a day lost to an interview not to
 * read as indiscipline. The guard against everything becoming "displaced" is that debt is
 * visible weekly and does not clear — §4.3, enforced at the week where it belongs.
 *
 * A non-negotiable with no commitment at all fails. Not planning the recall drill is not
 * a way to avoid missing it.
 */
function checkGate(commitments: Scorable[], prefs: Prefs): GateResult {
  if (!prefs.nonNegotiableGate) return { passed: true, failed: [] };

  const failed: string[] = [];

  for (const key of prefs.nonNegotiables) {
    const found = commitments.filter((commitment) => matches(commitment, key));
    if (found.length === 0) {
      failed.push(key);
      continue;
    }

    const active = found.filter((commitment) => commitment.status !== 'displaced');
    if (active.length === 0) continue;

    if (!active.every((commitment) => completionOf(commitment) >= 1)) failed.push(key);
  }

  return { passed: failed.length === 0, failed };
}

function bandFor(score: number, gatePassed: boolean, prefs: Prefs): Band {
  if (score >= prefs.greenThreshold) return gatePassed ? 'green' : 'yellow';
  if (score >= prefs.yellowThreshold) return 'yellow';
  return 'red';
}

/**
 * Score a day.
 *
 * `planned` is the extra argument the §6 contract does not name, and it has to be here:
 * "an unplanned day is red regardless of what got done" is a scoring rule, and putting it
 * anywhere else would let a caller quietly not apply it.
 */
export function scoreDay(
  commitments: Scorable[],
  prefs: Prefs,
  planned: boolean,
): ScoreResult {
  const gate = checkGate(commitments, prefs);
  const scored = commitments.filter((commitment) => commitment.status !== 'displaced');
  const displaced = commitments.length - scored.length;

  const weight = scored.reduce((sum, commitment) => sum + commitment.plannedMinutes, 0);
  const earned = scored.reduce(
    (sum, commitment) => sum + commitment.plannedMinutes * completionOf(commitment),
    0,
  );

  const base = {
    gatePassed: gate.passed,
    failedGates: gate.failed,
    weight,
    earned,
    scored: scored.length,
    displaced,
  };

  // The one thing the app is unambiguous about — SPEC §4.1.
  if (!planned) return { ...base, score: null, band: 'red' };

  // Everything that was planned got displaced. There is no ratio left to take.
  if (weight === 0) return { ...base, score: null, band: null };

  const score = Math.round((earned / weight) * 100);
  return { ...base, score, band: bandFor(score, gate.passed, prefs) };
}

/**
 * The live projected score — SPEC §3.1, "On pace: 64%." Visible from mid-morning rather
 * than discovered at 10 PM.
 *
 * Work still ahead of you is credited; work whose block has already gone is not. So the
 * number starts at 100 on an untouched day and drops the moment a block passes with its
 * commitment unfinished — which is exactly the moment worth knowing about.
 */
export function projectDay(
  commitments: Scorable[],
  prefs: Prefs,
  planned: boolean,
  blockHasPassed: (blockId: string | null) => boolean,
): ScoreResult {
  const projected = commitments.map((commitment) => {
    const stillWinnable =
      !isDropped(commitment) && !blockHasPassed(commitment.blockId);
    return stillWinnable ? { ...commitment, done: commitment.target } : commitment;
  });

  return scoreDay(projected, prefs, planned);
}

export interface BurnDown {
  /** Planned minutes still owed, discounted by whatever partial credit exists. */
  committedMinutes: number;
  availableMinutes: number;
  /** Minutes by which commitment exceeds the runway. Zero when it fits. */
  overBy: number;
  negative: boolean;
}

/**
 * The burn-down strip — SPEC §3.1. Remaining committed minutes against remaining
 * available minutes, red when committed exceeds available.
 *
 * Dropped commitments owe nothing: they are not going to be done, and pretending they
 * still weigh on the day would make the strip lie in the reassuring direction.
 */
export function burnDown(commitments: Scorable[], availableMinutes: number): BurnDown {
  const committedMinutes = commitments.reduce((sum, commitment) => {
    if (isDropped(commitment)) return sum;
    return sum + commitment.plannedMinutes * (1 - completionOf(commitment));
  }, 0);

  const overBy = Math.max(0, Math.round(committedMinutes - availableMinutes));

  return {
    committedMinutes: Math.round(committedMinutes),
    availableMinutes: Math.max(0, Math.round(availableMinutes)),
    overBy,
    negative: overBy > 0,
  };
}

/**
 * Triage order — SPEC §4.1. Commitments in reverse priority, so what the day can most
 * afford to lose is offered first. Least protected first, then largest.
 *
 * Only unfinished, undropped commitments are triageable. The app does not say "hurry":
 * deciding at 2 PM that today is a three-commitment day is discipline. Discovering at
 * 11 PM that you did 4 of 9 is not.
 */
export function triageOrder<T extends Scorable>(
  commitments: T[],
  priorityOf: (blockId: string | null) => number,
): T[] {
  return commitments
    .filter((commitment) => !isDropped(commitment) && completionOf(commitment) < 1)
    .slice()
    .sort((a, b) => {
      const byPriority = priorityOf(b.blockId) - priorityOf(a.blockId);
      if (byPriority !== 0) return byPriority;
      return b.plannedMinutes - a.plannedMinutes;
    });
}

/** Status implied by progress. Explicit drops are never overwritten by this. */
export function statusForProgress(commitment: Scorable): CommitmentRecord['status'] {
  if (isDropped(commitment)) return commitment.status;
  const completion = completionOf(commitment);
  if (completion >= 1) return 'complete';
  if (completion > 0) return 'partial';
  return 'open';
}
