import { BlockRow } from '../components/BlockRow';
import { CommitmentRow } from '../components/CommitmentRow';
import { DayBar } from '../components/DayBar';
import { ScoreBadge } from '../components/ScoreBadge';
import { containment, isActionable } from '../engine/boundaries';
import { completionOf, isDropped, scoreDay } from '../engine/scoring';
import { gateLabel } from '../lib/dayScoring';
import { formatDuration, toHHMM } from '../lib/time';
import { templateLabel } from '../lib/templates';
import type { Prefs } from '../lib/prefs';
import { useDay } from '../store/dayStore';

/**
 * Day — SPEC §3.2. The Day Bar, the totals, and a vertical timeline of today's blocks
 * with their commitments and the current position.
 *
 * The header carries committed versus completed weight, the score and the band. The
 * score here is what the day currently holds, not what it is on pace for — Now shows
 * the projection; this screen shows the ledger.
 */
export function Day({ now, prefs }: { now: number; prefs: Prefs }) {
  const {
    day,
    commitments,
    savedTemplates,
    correctBlock,
    addCommitment,
    setDone,
    dropCommitment,
    removeCommitment,
    setPlacementMode,
  } = useDay();

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
  const planned = day.plannedAt !== null;

  const result = scoreDay(commitments, prefs, planned);
  const labelFor = gateLabel(commitments, day.blocks);

  const unattached = commitments.filter((commitment) => commitment.blockId === null);
  const forBlock = (blockId: string): typeof commitments =>
    commitments.filter((commitment) => commitment.blockId === blockId);

  const completedWeight = Math.round(
    commitments
      .filter((commitment) => !isDropped(commitment))
      .reduce((sum, commitment) => sum + commitment.plannedMinutes * completionOf(commitment), 0),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl tracking-display text-text">
            {templateLabel(day.template, savedTemplates)}
          </h1>
          <span className="font-mono text-xs text-muted">Anchored {toHHMM(day.anchorAt)}</span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={day.placementMode}
          aria-label="Placement mode"
          onClick={() => void setPlacementMode(!day.placementMode)}
          className={`flex w-full items-center gap-3 border px-3 py-2 text-left ${
            day.placementMode ? 'border-signal' : 'border-edge'
          } bg-panel`}
        >
          <span
            className={`h-3.5 w-3.5 shrink-0 border ${
              day.placementMode ? 'border-signal bg-signal' : 'border-edge'
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-text">Placement mode</span>
            <span className="block text-xs text-muted">
              Drops default to displaced, weekly targets re-pace around the day, and the
              grid marks it. A day in an interview is not a lapse in discipline.
            </span>
          </span>
        </button>

        <DayBar
          blocks={day.blocks}
          now={now}
          fillFor={(block) => {
            const attached = forBlock(block.blockId).filter(
              (commitment) => commitment.status !== 'displaced',
            );
            if (attached.length === 0) return null;
            const weight = attached.reduce((sum, entry) => sum + entry.plannedMinutes, 0);
            if (weight === 0) return null;
            const earned = attached.reduce(
              (sum, entry) => sum + entry.plannedMinutes * completionOf(entry),
              0,
            );
            return earned / weight;
          }}
        />

        <div className="border border-edge bg-panel px-3 py-3">
          <ScoreBadge result={result} labelFor={labelFor} />
          {result.weight > 0 ? (
            <p className="mt-1 font-mono text-xs text-muted">
              {completedWeight} of {result.weight} committed minutes
              {result.displaced > 0 ? ` · ${result.displaced} displaced` : ''}
            </p>
          ) : null}
        </div>

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
              {day.pushes.length === 0
                ? '—'
                : `${day.pushes.length}× ${formatDuration(pushedMinutes)}`}
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
            commitments={forBlock(block.blockId)}
            {...(block.kind === 'gap'
              ? {}
              : { onAddCommitment: (input) => void addCommitment(input, now) })}
            onDone={(id, done) => void setDone(id, done)}
            onDrop={(id, reason, displacedBy) => void dropCommitment(id, reason, displacedBy)}
            onRemoveCommitment={(id) => void removeCommitment(id)}
            placementMode={day.placementMode}
          />
        ))}
      </section>

      {unattached.length > 0 ? (
        <section>
          <h2 className="mb-1 text-xs uppercase tracking-block text-muted">No block</h2>
          <div className="border-l-2 border-edge pl-3">
            {unattached.map((commitment) => (
              <CommitmentRow
                key={commitment.id}
                commitment={commitment}
                onDone={(done) => void setDone(commitment.id, done)}
                onDrop={(reason, displacedBy) =>
                  void dropCommitment(commitment.id, reason, displacedBy)
                }
                onRemove={() => void removeCommitment(commitment.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
