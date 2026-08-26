import { BlockRow } from '../components/BlockRow';
import { DayBar } from '../components/DayBar';
import { containment, isActionable } from '../engine/boundaries';
import { formatDuration, toHHMM } from '../lib/time';
import { templateLabel } from '../lib/templates';
import { useDay } from '../store/dayStore';

/**
 * Day — SPEC §3.2. The Day Bar, the totals, and a vertical timeline of today's blocks
 * with the current position.
 *
 * Committed-versus-completed weight, the live score and the band belong in the header
 * too, and arrive with scoring in session 3.
 */
export function Day({ now }: { now: number }) {
  const { day, savedTemplates, correctBlock } = useDay();

  if (!day?.anchorAt) {
    return (
      <div>
        <h1 className="font-display text-2xl tracking-display text-text">No day laid out</h1>
        <p className="mt-1 text-sm text-muted">Start the day on Now to see the timeline.</p>
      </div>
    );
  }

  const tally = containment(day.blocks);
  const actionable = day.blocks.filter(isActionable);
  const pushedMinutes = day.pushes.reduce((sum, entry) => sum + entry.minutes, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl tracking-display text-text">
            {templateLabel(day.template, savedTemplates)}
          </h1>
          <span className="font-mono text-xs text-muted">
            Anchored {toHHMM(day.anchorAt)}
          </span>
        </div>

        <DayBar blocks={day.blocks} now={now} />

        <dl className="grid grid-cols-3 gap-px border border-edge bg-edge">
          <div className="bg-panel px-3 py-2">
            <dt className="text-xs text-muted">Contained</dt>
            <dd className="font-mono text-sm text-text">
              {tally.percent === null ? '—' : `${tally.percent}%`}
              <span className="ml-1 text-xs text-muted">
                {tally.contained}/{tally.total}
              </span>
            </dd>
          </div>
          <div className="bg-panel px-3 py-2">
            <dt className="text-xs text-muted">Blocks</dt>
            <dd className="font-mono text-sm text-text">{actionable.length}</dd>
          </div>
          <div className="bg-panel px-3 py-2">
            <dt className="text-xs text-muted">Pushed</dt>
            <dd className="font-mono text-sm text-text">
              {day.pushes.length === 0 ? '—' : `${day.pushes.length}× ${formatDuration(pushedMinutes)}`}
            </dd>
          </div>
        </dl>

        {day.degradation.length > 0 ? (
          <div className="border border-edge bg-panel p-3">
            {day.degradation.map((line) => (
              <p key={line} className="text-xs text-muted">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </header>

      <section>
        {day.blocks.map((block) => (
          <BlockRow
            key={block.blockId}
            block={block}
            now={now}
            onCorrect={(status) => void correctBlock(block.blockId, status, now)}
          />
        ))}
      </section>
    </div>
  );
}
