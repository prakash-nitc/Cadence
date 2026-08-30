import { isActionable, viewStatus, type BlockView } from '../engine/boundaries';
import type { ScheduledBlock } from '../engine/layout';
import { formatDuration, toHHMM } from '../lib/time';

/**
 * The Day Bar — SPEC §8's signature element, and §16 of the redesign brief.
 *
 * One horizontal band representing the anchored day end to end. Each block is a segment
 * sized by its duration and coloured by status, with commitment completion filling within
 * the segment and a live marker at the current position. At a glance: how much of the day
 * is spent, how much was actually finished, how much was lost.
 *
 * The hour ruler underneath is what makes it a timeline rather than a stacked bar — a
 * segment is only meaningful once you can see it lands at 3pm.
 */

/** Segment colour by status. Skipped is hatched, not solid: nothing happened there. */
const SEGMENT: Record<BlockView, string> = {
  pending: 'bg-sunk',
  active: 'bg-signal',
  awaiting: 'bg-warn/70',
  contained: 'bg-pass/85',
  overran: 'bg-fail/80',
  skipped: 'bg-fail/15',
};

const STATUS_WORD: Record<BlockView, string> = {
  pending: 'to come',
  active: 'running now',
  awaiting: 'not answered',
  contained: 'contained',
  overran: 'overran',
  skipped: 'skipped',
};

const LEGEND: { view: BlockView; label: string }[] = [
  { view: 'contained', label: 'Contained' },
  { view: 'active', label: 'Now' },
  { view: 'pending', label: 'To come' },
  { view: 'awaiting', label: 'Not answered' },
  { view: 'overran', label: 'Overran' },
  { view: 'skipped', label: 'Skipped' },
];

interface DayBarProps {
  blocks: ScheduledBlock[];
  now: number;
  /** 0–1 commitment completion within a segment. */
  fillFor?: (block: ScheduledBlock) => number | null;
  /** Hour ruler and legend. Off for the compact strip used inside other cards. */
  detailed?: boolean;
}

/** Whole hours falling inside the day, for the ruler beneath the bar. */
function hourTicks(from: number, to: number): number[] {
  const ticks: number[] = [];
  const first = new Date(from);
  first.setMinutes(0, 0, 0);
  let at = first.getTime();
  if (at < from) at += 3_600_000;
  // Two-hourly, so a seventeen-hour day does not print a wall of numbers.
  const step = to - from > 10 * 3_600_000 ? 2 : 1;
  while (at <= to) {
    ticks.push(at);
    at += step * 3_600_000;
  }
  return ticks;
}

export function DayBar({ blocks, now, fillFor, detailed = false }: DayBarProps) {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last) return null;

  const dayStart = first.startsAt;
  const dayEnd = last.endsAt;
  const span = dayEnd - dayStart;
  if (span <= 0) return null;

  const livePercent = ((now - dayStart) / span) * 100;
  const liveVisible = livePercent >= 0 && livePercent <= 100;
  const at = (time: number): number => ((time - dayStart) / span) * 100;

  return (
    <div>
      <div
        className={`relative flex w-full gap-px overflow-hidden rounded-md bg-edge ${
          detailed ? 'h-12' : 'h-8'
        }`}
      >
        {blocks.map((block) => {
          const status = viewStatus(block, now);
          const fill = fillFor?.(block) ?? null;
          const width = ((block.endsAt - block.startsAt) / span) * 100;
          const done = fill === null ? '' : ` · ${Math.round(fill * 100)}% of its work done`;

          return (
            <div
              key={block.blockId}
              className={
                block.kind === 'gap'
                  ? 'relative h-full min-w-px bg-ink'
                  : `relative h-full min-w-px ${SEGMENT[status]}`
              }
              style={{ width: `${width}%` }}
              title={`${block.label} · ${toHHMM(block.startsAt)}–${toHHMM(block.endsAt)} · ${formatDuration(block.minutes)} · ${STATUS_WORD[status]}${done}`}
            >
              {fill !== null && isActionable(block) ? (
                <div
                  className="absolute inset-x-0 bottom-0 bg-deep/25"
                  style={{ height: `${Math.round(fill * 100)}%` }}
                />
              ) : null}
            </div>
          );
        })}

        {liveVisible ? (
          <div
            className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-text"
            style={{ left: `${livePercent}%` }}
            aria-hidden
          />
        ) : null}
      </div>

      {detailed ? (
        <div className="relative mt-1.5 h-4">
          {hourTicks(dayStart, dayEnd).map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2 font-mono text-[11px] text-muted"
              style={{ left: `${at(tick)}%` }}
            >
              {toHHMM(tick)}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted">
          <span>{toHHMM(dayStart)}</span>
          <span>{toHHMM(dayEnd)}</span>
        </div>
      )}

      {detailed ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {LEGEND.map(({ view, label }) => (
            <span key={view} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className={`h-2.5 w-2.5 rounded-sm ${SEGMENT[view]}`} />
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
