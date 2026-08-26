import { isActionable, viewStatus, type BlockView } from '../engine/boundaries';
import type { ScheduledBlock } from '../engine/layout';
import { formatDuration, toHHMM } from '../lib/time';

/**
 * The Day Bar — SPEC §8's signature element.
 *
 * One horizontal band representing the anchored day end to end. Each block is a segment
 * sized by its duration and coloured by status, with a thin `signal` marker at the live
 * position. At a glance: how much of the day is spent, how much was finished, how much
 * was lost. Nothing else on the screen competes with it.
 *
 * Commitment completion renders as a fill *within* each segment — that arrives with
 * commitments in session 3, which is why `fillFor` is a seam rather than a feature.
 */

/** Segment colour by status. Skipped is outlined, not solid: nothing happened there. */
const SEGMENT: Record<BlockView, string> = {
  pending: 'bg-edge',
  active: 'bg-signal',
  awaiting: 'bg-warn',
  contained: 'bg-pass',
  overran: 'bg-fail',
  skipped: 'bg-transparent border border-fail',
};

interface DayBarProps {
  blocks: ScheduledBlock[];
  now: number;
  /** 0–1 completion within a segment. Session 3. */
  fillFor?: (block: ScheduledBlock) => number | null;
}

export function DayBar({ blocks, now, fillFor }: DayBarProps) {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last) return null;

  const dayStart = first.startsAt;
  const dayEnd = last.endsAt;
  const span = dayEnd - dayStart;
  if (span <= 0) return null;

  const livePercent = ((now - dayStart) / span) * 100;
  const liveVisible = livePercent >= 0 && livePercent <= 100;

  return (
    <div>
      <div className="relative flex h-10 w-full gap-px overflow-hidden rounded-sm bg-ink">
        {blocks.map((block) => {
          const status = viewStatus(block, now);
          const fill = fillFor?.(block) ?? null;
          const width = ((block.endsAt - block.startsAt) / span) * 100;

          return (
            <div
              key={block.blockId}
              className={
                block.kind === 'gap'
                  ? 'relative h-full min-w-px bg-panel'
                  : `relative h-full min-w-px ${SEGMENT[status]}`
              }
              style={{ width: `${width}%` }}
              title={`${block.label} · ${toHHMM(block.startsAt)}–${toHHMM(block.endsAt)} · ${formatDuration(block.minutes)}`}
            >
              {fill !== null && isActionable(block) ? (
                <div
                  className="absolute bottom-0 left-0 w-full bg-text/20"
                  style={{ height: `${Math.round(fill * 100)}%` }}
                />
              ) : null}
            </div>
          );
        })}

        {liveVisible ? (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-signal"
            style={{ left: `${livePercent}%` }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
        <span>{toHHMM(dayStart)}</span>
        <span>{toHHMM(dayEnd)}</span>
      </div>
    </div>
  );
}
