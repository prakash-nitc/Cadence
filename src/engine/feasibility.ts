/**
 * Plan-time feasibility — SPEC §4.2.
 *
 * 80% of an honest plan is achievable; 80% of an aspirational one is not. The fix goes
 * at plan time, not at score time — which is why nothing here blocks a save. It warns,
 * it quotes the user's own record back at them, and then it gets out of the way.
 *
 * Pure: no I/O, no clock.
 */
import type { Prefs } from '../lib/prefs';

/** What feasibility needs from a proposed commitment. */
export interface Proposed {
  id: string;
  label: string;
  target: number;
  plannedMinutes: number;
  tags: string[];
}

/** What it needs from a past one. */
export interface HistoricCommitment {
  dayDate: string;
  tags: string[];
  done: number;
}

export interface HistoryNote {
  commitmentId: string;
  label: string;
  tag: string;
  target: number;
  /** Days in the window where the day's total for this tag reached the target. */
  hits: number;
  days: number;
}

export type FeasibilityStatus = 'within' | 'overSlack' | 'overCapacity';

export interface Verdict {
  committedMinutes: number;
  availableMinutes: number;
  /** What `planningSlack` of available time comes to. The slack is the plan. */
  slackMinutes: number;
  status: FeasibilityStatus;
  /** Minutes past the slack line. Zero when within it. */
  overBy: number;
  notes: HistoryNote[];
  /** True once there is enough history to quote — `prefs.historyWindowDays`. */
  historyReady: boolean;
  historyDays: number;
}

/**
 * Compare a proposed day against the time it has and against the user's own record.
 *
 * `availableMinutes` is the committable time in tomorrow's template, not the wall-clock
 * length of the day: meals and breaks are not slots you can put work in.
 */
export function checkFeasibility(
  commitments: Proposed[],
  availableMinutes: number,
  history: HistoricCommitment[],
  prefs: Prefs,
): Verdict {
  const committedMinutes = commitments.reduce(
    (sum, commitment) => sum + commitment.plannedMinutes,
    0,
  );
  const slackMinutes = Math.round(availableMinutes * prefs.planningSlack);

  const status: FeasibilityStatus =
    committedMinutes > availableMinutes
      ? 'overCapacity'
      : committedMinutes > slackMinutes
        ? 'overSlack'
        : 'within';

  const historyDays = new Set(history.map((entry) => entry.dayDate)).size;
  const historyReady = historyDays >= prefs.historyWindowDays;

  return {
    committedMinutes,
    availableMinutes,
    slackMinutes,
    status,
    overBy: Math.max(0, committedMinutes - slackMinutes),
    notes: historyReady ? historyNotes(commitments, history) : [],
    historyReady,
    historyDays,
  };
}

/**
 * The history check — stated before committing, not after failing.
 *
 * A day's total for a tag is what counts, not an individual commitment: three problems
 * in the morning block and one in the evening is a four-problem day. Reported at the
 * target actually being proposed, so the number answers the question being asked.
 */
function historyNotes(commitments: Proposed[], history: HistoricCommitment[]): HistoryNote[] {
  const notes: HistoryNote[] = [];

  for (const commitment of commitments) {
    const tag = commitment.tags[0];
    if (!tag || commitment.target <= 0) continue;

    const perDay = new Map<string, number>();
    for (const entry of history) {
      if (!entry.tags.includes(tag)) continue;
      perDay.set(entry.dayDate, (perDay.get(entry.dayDate) ?? 0) + entry.done);
    }
    if (perDay.size === 0) continue;

    const hits = [...perDay.values()].filter((total) => total >= commitment.target).length;

    notes.push({
      commitmentId: commitment.id,
      label: commitment.label,
      tag,
      target: commitment.target,
      hits,
      days: perDay.size,
    });
  }

  return notes;
}

/**
 * Committable minutes in a template — the time commitments can actually be attached to.
 *
 * Work blocks only. A meal is not a slot you can put a commitment in, and counting it
 * would make every plan look feasible.
 */
export function committableMinutes(blocks: { kind: string; minutes: number }[]): number {
  return blocks
    .filter((block) => block.kind === 'work')
    .reduce((sum, block) => sum + block.minutes, 0);
}
