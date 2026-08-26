/**
 * Capacity and degradation — SPEC §2.4.
 *
 * At Start day, measure anchor -> soft day end. If the template does not fit, cut in
 * protection order and say exactly what was cut. Pure: the clock is passed in.
 *
 * Order, least protected first:
 *   1. Drop priority 2 (droppable)      — flex, second DSA pass, tea break
 *   2. Compress priority 1 to its floor — sequential track, wind-down
 *   3. Drop priority 1 if still over
 *   4. Compress priority 0 to its floor — DSA, Spring Boot, recall, log
 *
 * Priority 0 is never dropped and priority 3 meals never drop, so a template can still
 * exceed capacity after every legal cut. That is reported as a shortfall, not hidden.
 */
import type { BlockDef, FixedWindow, Priority } from '../config/schedule.config';
import type { Prefs } from '../lib/prefs';
import { atTimeOn, minutesBetween } from '../lib/time';
import { layoutDay, type ScheduledBlock } from './layout';

export type CutReason = 'droppable' | 'compressible' | 'gymCutoff';

export type Cut =
  | { kind: 'dropped'; blockId: string; label: string; minutes: number; reason: CutReason }
  | { kind: 'compressed'; blockId: string; label: string; from: number; to: number };

export interface Degradation {
  blocks: BlockDef[];
  cuts: Cut[];
  /** Minutes the untouched template would take. */
  templateMinutes: number;
  availableMinutes: number;
  /** Minutes still over capacity once protected floors are reached. */
  shortfallMinutes: number;
}

const totalMinutes = (blocks: BlockDef[]): number =>
  blocks.reduce((sum, block) => sum + block.minutes, 0);

/** The floor a block can be compressed to. No `minMinutes` means not compressible. */
const floorOf = (block: BlockDef): number => block.minMinutes ?? block.minutes;

/** Minutes from the anchor to the soft day end. Never negative. */
export function availableMinutes(anchor: Date, dayEnd: string): number {
  return Math.max(0, minutesBetween(anchor, atTimeOn(anchor, dayEnd)));
}

/** Minutes since midnight for the anchor's calendar day. */
export function anchorMinutes(anchor: Date): number {
  return anchor.getHours() * 60 + anchor.getMinutes();
}

/**
 * Drop blocks in a tier until the deficit is covered.
 *
 * Prefers the smallest single block that covers the deficit on its own — cutting a
 * 90-minute flex block to recover 20 minutes would be a worse trade than cutting a
 * 20-minute tea break. Falls back to largest-first when nothing covers it alone.
 *
 * Recovers a block's *current* minutes, not its template minutes: a block already
 * compressed to its floor gives back only what is left of it.
 */
function dropTier(
  candidates: BlockDef[],
  deficit: number,
  reason: CutReason,
  cuts: Cut[],
  dropped: Set<string>,
  current: (block: BlockDef) => number,
): number {
  let remaining = deficit;
  const pool = candidates.filter((block) => !dropped.has(block.id));

  while (remaining > 0 && pool.length > 0) {
    const sufficient = pool
      .filter((block) => current(block) >= remaining)
      .sort((a, b) => current(a) - current(b))[0];
    const pick = sufficient ?? pool.slice().sort((a, b) => current(b) - current(a))[0];
    if (!pick) break;

    const minutes = current(pick);
    dropped.add(pick.id);
    pool.splice(pool.indexOf(pick), 1);

    // A dropped block is not also a compressed one — don't report both.
    const superseded = cuts.findIndex(
      (cut) => cut.kind === 'compressed' && cut.blockId === pick.id,
    );
    if (superseded !== -1) cuts.splice(superseded, 1);

    cuts.push({ kind: 'dropped', blockId: pick.id, label: pick.label, minutes, reason });
    remaining -= minutes;
  }

  return remaining;
}

/**
 * Shrink blocks in a tier toward their floors, in template order, taking only as much
 * as the deficit needs. Partial compression is the point — a block cut to 90 minutes
 * when 90 is enough should not be cut to 60.
 */
function compressTier(
  candidates: BlockDef[],
  deficit: number,
  cuts: Cut[],
  compressed: Map<string, number>,
  dropped: Set<string>,
): number {
  let remaining = deficit;

  for (const block of candidates) {
    if (remaining <= 0) break;
    if (dropped.has(block.id)) continue;

    const current = compressed.get(block.id) ?? block.minutes;
    const slack = current - floorOf(block);
    if (slack <= 0) continue;

    const take = Math.min(slack, remaining);
    const next = current - take;
    compressed.set(block.id, next);
    cuts.push({
      kind: 'compressed',
      blockId: block.id,
      label: block.label,
      from: block.minutes,
      to: next,
    });
    remaining -= take;
  }

  return remaining;
}

/**
 * Fit a template into the available minutes, reporting every cut.
 *
 * `anchorAtMinutes` is minutes since midnight for the anchor — the clock, passed in,
 * so the gym cutoff can be applied without the engine reading a real clock.
 */
export function degrade(
  template: BlockDef[],
  available: number,
  prefs: Prefs,
  anchorAtMinutes: number,
): Degradation {
  const cuts: Cut[] = [];
  const dropped = new Set<string>();
  const compressed = new Map<string, number>();
  const templateMinutes = totalMinutes(template);

  // Gym goes if the day started late. Not a capacity decision — a clock decision.
  if (anchorAtMinutes > prefs.gymCutoffHour * 60) {
    for (const block of template) {
      if (!block.cutoffSensitive) continue;
      dropped.add(block.id);
      cuts.push({
        kind: 'dropped',
        blockId: block.id,
        label: block.label,
        minutes: block.minutes,
        reason: 'gymCutoff',
      });
    }
  }

  const currentMinutes = (): number =>
    template
      .filter((block) => !dropped.has(block.id))
      .reduce((sum, block) => sum + (compressed.get(block.id) ?? block.minutes), 0);

  const tier = (priority: Priority): BlockDef[] =>
    template.filter((block) => block.priority === priority);

  const current = (block: BlockDef): number => compressed.get(block.id) ?? block.minutes;

  let deficit = currentMinutes() - available;

  if (deficit > 0) deficit = dropTier(tier(2), deficit, 'droppable', cuts, dropped, current);
  if (deficit > 0) deficit = compressTier(tier(1), deficit, cuts, compressed, dropped);
  if (deficit > 0) deficit = dropTier(tier(1), deficit, 'compressible', cuts, dropped, current);
  if (deficit > 0) deficit = compressTier(tier(0), deficit, cuts, compressed, dropped);

  const blocks = template
    .filter((block) => !dropped.has(block.id))
    .map((block) => {
      const minutes = compressed.get(block.id);
      return minutes === undefined ? block : { ...block, minutes };
    });

  return {
    blocks,
    cuts,
    templateMinutes,
    availableMinutes: available,
    shortfallMinutes: Math.max(0, deficit),
  };
}

export interface PlannedDay {
  blocks: ScheduledBlock[];
  degradation: Degradation;
}

/**
 * Start day: measure capacity, degrade, lay the result out against the mess windows.
 * Computed once and persisted — SPEC §2.2.5.
 */
export function planDay(
  anchor: Date,
  template: BlockDef[],
  windows: FixedWindow[],
  prefs: Prefs,
): PlannedDay {
  const degradation = degrade(
    template,
    availableMinutes(anchor, prefs.dayEnd),
    prefs,
    anchorMinutes(anchor),
  );

  return {
    blocks: layoutDay(anchor, degradation.blocks, windows),
    degradation,
  };
}
