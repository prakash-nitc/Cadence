/**
 * The pieces of the Now screen — §8–§15 of the redesign brief.
 *
 * Now answers, in this order: what am I doing, how far in am I, am I on pace, what comes
 * next. Each of those is one component here, so the screen file stays a layout and the
 * question each block answers stays legible.
 */
import type { Band } from '../../db/schema';
import type { ScheduledBlock } from '../../engine/layout';
import type { ScoreResult } from '../../engine/scoring';
import { formatDuration, toHHMM } from '../../lib/time';
import { Countdown } from '../Countdown';
import { Icon } from '../ui/Icon';
import { Bar, Ring, type Tone } from '../ui/primitives';

export const BAND_TONE: Record<Band, Tone> = {
  green: 'pass',
  yellow: 'warn',
  red: 'fail',
};

/**
 * The hero — §8. The block name and the countdown, sized so they read from across a desk,
 * over a bar showing how far through the block the clock is.
 *
 * The bar tracks *time*, not work: it is the honest one of the two, and it turns amber
 * once the block is nearly out regardless of how much got done.
 */
export function CurrentBlockHero({
  block,
  now,
  greeting,
}: {
  block: ScheduledBlock;
  now: number;
  greeting?: string;
}) {
  const span = block.endsAt - block.startsAt;
  const elapsed = Math.min(Math.max(now - block.startsAt, 0), span);
  const fraction = span <= 0 ? 1 : elapsed / span;
  const remaining = block.endsAt - now;
  const tone: Tone = remaining <= 0 ? 'fail' : remaining <= 5 * 60_000 ? 'warn' : 'pass';

  return (
    <section className="card p-6">
      {greeting ? <p className="mb-4 text-sm text-soft">{greeting}</p> : null}

      <p className="eyebrow">Currently working</p>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-display text-text">
            {block.label}
          </h2>
          <p className="mt-0.5 text-sm capitalize text-soft">{block.kind}</p>
        </div>
        <div className="text-right">
          <Countdown endsAt={block.endsAt} now={now} className="text-[46px] leading-none" />
          <p className="mt-1.5 font-mono text-sm text-muted">
            {toHHMM(block.startsAt)} – {toHHMM(block.endsAt)}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <Bar value={fraction} tone={tone} height="h-2.5" animate={false} />
        <div className="mt-1.5 flex justify-between font-mono text-xs text-muted">
          <span>{formatDuration(Math.round(elapsed / 60_000))} in</span>
          <span>
            {remaining <= 0
              ? 'over'
              : `${formatDuration(Math.round(remaining / 60_000))} left`}
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * The pace ring — §12. One number, the word for it, and the ring reading it at a glance.
 * Colour never carries the state alone: the band word sits under the percentage.
 */
export function PaceCard({
  result,
  labelFor,
}: {
  result: ScoreResult;
  labelFor: (key: string) => string;
}) {
  const { score, band, failedGates } = result;
  const tone: Tone = band ? BAND_TONE[band] : 'neutral';

  const verdict =
    score === null
      ? 'Nothing to score'
      : band === 'green'
        ? 'On pace'
        : band === 'yellow'
          ? 'Needs attention'
          : 'Materially behind';

  return (
    <section className="card p-5">
      <p className="eyebrow">Pace</p>
      <div className="mt-3 flex flex-col items-center">
        <Ring value={score === null ? null : score / 100} tone={tone} size={132} />
        <p className={`mt-3 text-sm font-medium ${tone === 'neutral' ? 'text-soft' : ''}`}>
          {verdict}
        </p>
        {score !== null ? (
          <p className="mt-0.5 text-xs text-muted">projected for the full day</p>
        ) : null}
      </div>

      {failedGates.length > 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-fail/10 px-3 py-2 text-xs text-fail">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          <span>{failedGates.map(labelFor).join(', ')} — non-negotiable, still open.</span>
        </p>
      ) : null}

      {score === null ? (
        <p className="mt-3 text-xs text-muted">
          {result.displaced > 0
            ? 'Every commitment displaced. Nothing left to score.'
            : 'Add commitments with planned minutes to get a score.'}
        </p>
      ) : null}
    </section>
  );
}

/** The day in four numbers — §13. A strip, so it reads left to right in one pass. */
export function DailyMetrics({
  committed,
  remaining,
  contained,
  pushed,
  stranded,
}: {
  committed: number;
  remaining: number;
  contained: number | null;
  pushed: number;
  stranded: number;
}) {
  const cells: { label: string; value: string; tone?: Tone; sub?: string }[] = [
    { label: 'Committed', value: formatDuration(committed) },
    {
      label: 'Day remaining',
      value: formatDuration(remaining),
      tone: committed > remaining ? 'fail' : 'neutral',
      ...(committed > remaining
        ? { sub: `over by ${formatDuration(committed - remaining)}` }
        : {}),
    },
    { label: 'Contained', value: contained === null ? '—' : `${contained}%` },
    { label: 'Pushed', value: pushed === 0 ? '—' : `${pushed}×` },
  ];

  return (
    <section>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-edge bg-edge">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-panel px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-block text-muted">{cell.label}</p>
            <p
              className={`mt-1.5 font-mono text-xl font-semibold ${
                cell.tone === 'fail' ? 'text-fail' : 'text-text'
              }`}
            >
              {cell.value}
            </p>
            {cell.sub ? <p className="mt-0.5 text-xs text-fail">{cell.sub}</p> : null}
          </div>
        ))}
      </div>

      {stranded > 0 ? (
        <p className="mt-2 flex items-start gap-2 px-1 text-xs text-muted">
          <Icon name="clock" size={13} className="mt-px shrink-0" />
          <span>
            {formatDuration(stranded)} owed on blocks that have passed. Triage cannot reach
            it; the score already counts what got done.
          </span>
        </p>
      ) : null}
    </section>
  );
}

/** What comes next — §14. Always findable, never competing with the running block. */
export function NextBlock({ block }: { block: ScheduledBlock | null }) {
  return (
    <section className="card p-5">
      <p className="eyebrow">Next</p>
      {block ? (
        <div className="mt-3 flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="h-2 w-2 rounded-sm bg-muted" />
            <span className="mt-1 w-px flex-1 bg-edge" />
          </div>
          <div className="min-w-0 pb-1">
            <p className="font-mono text-lg font-semibold text-text">{toHHMM(block.startsAt)}</p>
            <p className="mt-0.5 truncate text-sm text-text">{block.label}</p>
            <p className="mt-0.5 font-mono text-xs text-muted">
              {formatDuration(block.minutes)}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-soft">Nothing after this. The day runs out here.</p>
      )}
    </section>
  );
}

/** The standing rule for the date — §15. Present, never dominant. */
export function RuleCard({ rule }: { rule: string }) {
  return (
    <section className="rounded-lg border border-edge bg-sunk p-5">
      <p className="eyebrow flex items-center gap-2">
        <Icon name="bookmark" size={13} />
        Rule
      </p>
      <p className="mt-2 text-sm leading-relaxed text-soft">{rule}</p>
    </section>
  );
}
