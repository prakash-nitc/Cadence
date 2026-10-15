/**
 * Rows going into tomorrow's plan from somewhere other than the roadmap — SPEC §3.4.
 *
 * Planning used to mean typing the day in: suggestions come from the roadmap's presets, and
 * a plan built around this week's actual work matched none of them. A saved template, a copy
 * of today, and anything added on Plan all arrive here as rows, and every one goes through
 * the same merge, so none of them can put the same piece of work in the plan twice.
 *
 * Pure.
 */
import type { TemplateCommitment } from '../db/schema';
import { sameName } from '../engine/carry';
import type { Size } from '../engine/shape';
import type { PlanItem } from '../store/planStore';

export type RowSource = 'template' | 'added';

/** What a template keeps of a plan row: the work, not its progress or history. */
export function toTemplateCommitment(item: PlanItem): TemplateCommitment {
  return {
    blockId: item.blockId,
    label: item.label.trim(),
    targetType: item.targetType,
    target: item.target,
    plannedMinutes: item.plannedMinutes,
    tags: item.tags,
    ...(item.size ? { size: item.size } : {}),
  };
}

/**
 * A row's key comes from what it is, not when it arrived. The plan list is recomposed
 * whenever anything under it changes, and edits are kept by key: a key minted fresh each
 * time made every recompose throw away every edit to a template row.
 */
const keyFor = (source: RowSource, row: TemplateCommitment): string =>
  `${source}:${row.blockId ?? 'none'}:${sameName(row.label)}`;

/**
 * Bring rows into the plan, ticked.
 *
 * - Typed by hand, a row with a leftover's name is that work carried on: the leftover is
 *   ticked rather than a second row added (§4.1), keeping its line and move count.
 * - From a template or a copied day, the row is recurring work and stands on its own. The
 *   leftover it matches is superseded — see `superseded` — rather than continued: ticking it
 *   would turn daily work into a leftover moved again every single night.
 * - Anything already in the plan with the same name in the same slot is ticked, not doubled.
 * - Everything else is added as a new row.
 *
 * Names match as a person means them: case and spacing do not count, anything else does.
 */
export function mergeIntoPlan(
  items: PlanItem[],
  rows: TemplateCommitment[],
  source: RowSource,
): PlanItem[] {
  let next = [...items];

  for (const row of rows) {
    const name = sameName(row.label);
    if (!name) continue;

    const leftover =
      source === 'added'
        ? next.find((item) => item.source === 'carry' && sameName(item.label) === name)
        : undefined;
    if (leftover) {
      next = next.map((item) => (item.key === leftover.key ? { ...item, selected: true } : item));
      continue;
    }

    const present = next.find(
      (item) =>
        item.source !== 'carry' && item.blockId === row.blockId && sameName(item.label) === name,
    );
    if (present) {
      next = next.map((item) => (item.key === present.key ? { ...item, selected: true } : item));
      continue;
    }

    next.push({
      key: keyFor(source, row),
      source,
      carriedFrom: null,
      blockId: row.blockId,
      label: row.label.trim(),
      targetType: row.targetType,
      target: row.target,
      plannedMinutes: row.plannedMinutes,
      tags: row.tags,
      selected: true,
      movedCount: 0,
      detail: null,
      ...(row.size ? { size: row.size as Size } : {}),
    });
  }

  return next;
}

/**
 * Leftovers that a ticked row of the same name now covers — recurring work from a template
 * or a copied day. They leave the box, and are retired when the plan is saved: the template
 * brings the work back each day, so the leftover would only ever be a duplicate.
 */
export function superseded(items: PlanItem[]): PlanItem[] {
  const covered = new Set(
    items
      .filter((item) => item.selected && item.source !== 'carry')
      .map((item) => sameName(item.label)),
  );
  return items.filter(
    (item) => item.source === 'carry' && !item.selected && covered.has(sameName(item.label)),
  );
}

