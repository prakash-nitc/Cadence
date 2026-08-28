/**
 * Roadmap-derived plan suggestions — SPEC §3.4, part 2, step 3.
 *
 * "Current core CSE subject, current Spring Boot phase, current DSA topic, all read
 * from config." Planning is then editing rather than composing, which is most of what
 * keeps the evening flow under three minutes.
 *
 * Everything here reads `schedule.config.ts` and nothing else. When the roadmap is
 * swapped at the end of a phase, these follow it without a code change.
 */
import {
  COMMITMENT_PRESETS,
  DSA_TOPICS,
  CORE_CSE_TRACK,
  SPRING_PHASES,
  type CommitmentPreset,
  type Subject,
} from '../config/schedule.config';

interface Dated {
  startDate: string;
  endDate: string;
}

/**
 * The entry covering `date`; failing that the next one to start; failing that the last.
 *
 * The ranges in config have gaps — SQL ends on a Saturday and DBMS starts the following
 * Tuesday — so a date landing in a gap has to resolve forward rather than to nothing.
 */
function activeAt<T extends Dated>(entries: T[], date: string): T | null {
  const covering = entries.find((entry) => date >= entry.startDate && date <= entry.endDate);
  if (covering) return covering;

  const upcoming = entries
    .filter((entry) => entry.startDate > date)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (upcoming) return upcoming;

  return entries[entries.length - 1] ?? null;
}

export function currentSubject(date: string): Subject | null {
  return activeAt(CORE_CSE_TRACK, date);
}

export function currentSpringPhase(date: string): (typeof SPRING_PHASES)[number] | null {
  return activeAt(SPRING_PHASES, date);
}

/**
 * The DSA topic currently in play.
 *
 * Config gives the topics an order and a per-topic target but no dates, so the only
 * honest way to say which one is current is to walk them against how many problems have
 * actually been logged. Falls back to the first topic when there is no history.
 */
export function currentDsaTopic(problemsDone: number): (typeof DSA_TOPICS)[number] | null {
  let remaining = problemsDone;
  for (const topic of DSA_TOPICS) {
    if (remaining < topic.target) return topic;
    remaining -= topic.target;
  }
  return DSA_TOPICS[DSA_TOPICS.length - 1] ?? null;
}

/**
 * The label a preset should carry on a given day. Presets that derive pull their name
 * from the roadmap so "Core CSE" reads "SQL" in September and "LLD" in October.
 */
export function deriveLabel(
  preset: CommitmentPreset,
  date: string,
  problemsDone: number,
): string {
  switch (preset.derive) {
    case 'coreCseSubject': {
      const subject = currentSubject(date);
      return subject ? subject.label : preset.label;
    }
    case 'springPhase': {
      const phase = currentSpringPhase(date);
      return phase ? phase.label : preset.label;
    }
    case 'dsaTopic': {
      const topic = currentDsaTopic(problemsDone);
      return topic ? `${topic.label} problems` : preset.label;
    }
    default:
      return preset.label;
  }
}

export interface Suggestion {
  blockId: string;
  label: string;
  targetType: CommitmentPreset['targetType'];
  target: number;
  tags: string[];
  /** The roadmap detail behind the suggestion, shown as one muted line. */
  detail: string | null;
}

/**
 * Suggestions for a template, in template order — SPEC §3.4. Only presets whose block
 * exists in the chosen template are offered: a Saturday plan should not suggest the
 * weekday Spring Boot split.
 */
export function suggestionsFor(
  templateBlockIds: string[],
  date: string,
  problemsDone: number,
): Suggestion[] {
  const order = new Map(templateBlockIds.map((id, index) => [id, index]));

  const suggestions = COMMITMENT_PRESETS.filter((preset) => order.has(preset.blockId))
    .map((preset) => ({
      blockId: preset.blockId,
      label: deriveLabel(preset, date, problemsDone),
      targetType: preset.targetType,
      target: preset.target,
      tags: preset.tags,
      detail: detailFor(preset, date),
    }))
    .sort((a, b) => (order.get(a.blockId) ?? 0) - (order.get(b.blockId) ?? 0));

  // Spring Boot is split across two blocks and both derive the same phase, so the same
  // paragraph would print twice. It is context, not a per-line instruction — say it once.
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    if (!suggestion.detail) continue;
    if (seen.has(suggestion.detail)) suggestion.detail = null;
    else seen.add(suggestion.detail);
  }

  return suggestions;
}

function detailFor(preset: CommitmentPreset, date: string): string | null {
  if (preset.derive === 'coreCseSubject') return currentSubject(date)?.sources ?? null;
  if (preset.derive === 'springPhase') return currentSpringPhase(date)?.detail ?? null;
  return null;
}
