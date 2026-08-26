/**
 * Template selection. Reads the roadmap's data — which template a weekday defaults to,
 * and when a late anchor should suggest a different one.
 */
import {
  DEFAULT_TEMPLATE_BY_DAY,
  LATE_NIGHT_THRESHOLD_HOUR,
  TEMPLATES,
  type BlockDef,
  type TemplateId,
} from '../config/schedule.config';
import type { SavedTemplate } from '../db/schema';

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  full: 'Full day',
  lateNight: 'Late night',
  saturday: 'Saturday',
  sunday: 'Sunday',
  recovery: 'Recovery',
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

export function isConfigTemplate(id: string): id is TemplateId {
  return id in TEMPLATES;
}

/**
 * The template to open the picker on.
 *
 * A late anchor suggests `lateNight` — that template reorders so DSA still comes first,
 * because Rule 1 is "before anything else today", not "at 08:05". It is a suggestion:
 * the picker still shows every template and the user chooses.
 */
export function suggestedTemplate(anchor: Date): TemplateId {
  if (anchor.getHours() >= LATE_NIGHT_THRESHOLD_HOUR) return 'lateNight';
  return DEFAULT_TEMPLATE_BY_DAY[anchor.getDay()] ?? 'full';
}

/** Config templates are fixed; saved templates come from the database — SPEC §2.6. */
export function blocksForTemplate(id: string, saved: SavedTemplate[]): BlockDef[] | null {
  if (isConfigTemplate(id)) return TEMPLATES[id];
  return saved.find((template) => template.id === id)?.blocks ?? null;
}

export function templateLabel(id: string, saved: SavedTemplate[]): string {
  if (isConfigTemplate(id)) return TEMPLATE_LABELS[id];
  return saved.find((template) => template.id === id)?.name ?? id;
}
