import { useState } from 'react';
import { BlockRow } from '../components/BlockRow';
import { CustomDay } from '../components/CustomDay';
import { CommitmentRow } from '../components/CommitmentRow';
import { DayBar } from '../components/DayBar';
import { BAND_TONE } from '../components/now/NowParts';
import { Icon } from '../components/ui/Icon';
import { Button, Card, Panel, Pill, Ring, SectionTitle } from '../components/ui/primitives';
import { containment, isActionable, isResolved } from '../engine/boundaries';
import { completionOf, isDropped, scoreDay } from '../engine/scoring';
import { availableMinutes } from '../engine/capacity';
import { gateLabel, unslotted } from '../lib/dayScoring';
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
    editCommitment,
    setPlacementMode,
    relayDay,
    resetDay,
    saveTemplate,
  } = useDay();
  const [relaying, setRelaying] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (!day?.anchorAt) {
    return (
      <div>
        <h1 className="font-display text-2xl tracking-display text-text">No day laid out</h1>
        <p className="mt-1 text-sm text-muted">Start the day on Now to see the timeline.</p>
      </div>
    );
  }

  if (relaying) {
    const from = new Date(now);
    return (
      <CustomDay
        seed={day.blocks
          .filter((block) => !isResolved(block) && block.kind !== 'gap')
          .map((block) => ({
            id: block.blockId,
            label: block.label,
            minutes: block.minutes,
            kind: block.kind === 'gap' ? ('work' as const) : block.kind,
            priority: block.priority,
            ...(block.window ? { window: block.window } : {}),
          }))}
        anchor={from}
        availableMinutes={availableMinutes(from, prefs.dayEnd)}
        onUse={(blocks) => {
          void relayDay(from, blocks, prefs);
          setRelaying(false);
        }}
        onSaveTemplate={(name, blocks) => void saveTemplate(name, blocks, now)}
        onCancel={() => setRelaying(false)}
      />
    );
  }

  const tally = containment(day.blocks);
  const actionable = day.blocks.filter(isActionable);
  const pushedMinutes = day.pushes.reduce((sum, entry) => sum + entry.minutes, 0);
  const planned = day.plannedAt !== null;

  const result = scoreDay(commitments, prefs, planned);
  const labelFor = gateLabel(commitments, day.blocks);

  const bandWord = result.band ?? 'not scored';
  const unattached = unslotted(commitments, day.blocks);
  const unattachedMinutes = unattached
    .filter((commitment) => !isDropped(commitment))
    .reduce((sum, commitment) => sum + commitment.plannedMinutes, 0);
  const forBlock = (blockId: string): typeof commitments =>
    commitments.filter((commitment) => commitment.blockId === blockId);

  const completedWeight = Math.round(
    commitments
      .filter((commitment) => !isDropped(commitment))
      .reduce((sum, commitment) => sum + commitment.plannedMinutes * completionOf(commitment), 0),
  );

  const score = result.score;
  const tone = result.band ? BAND_TONE[result.band] : 'neutral';

  return (
    <div className="space-y-5">
      {/* The day at a glance: the ring, the timeline, and the four numbers. */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="flex flex-col items-center justify-center py-6">
          <Ring value={score === null ? null : score / 100} tone={tone} label="of the day" />
          {score === null ? (
            <p className="mt-4 max-w-[15rem] text-center text-sm text-soft">
              {result.band === 'red'
                ? 'Not planned. A day with nothing committed to scores red.'
                : result.displaced > 0
                  ? 'Every commitment displaced. Nothing left to score.'
                  : 'These commitments carry no weight. Give them planned minutes to score.'}
            </p>
          ) : (
            <p className="mt-4 text-center font-mono text-sm text-soft">
              {completedWeight} of {result.weight} committed minutes
            </p>
          )}
          {result.displaced > 0 ? (
            <p className="mt-1 text-center text-xs text-muted">
              {result.displaced} displaced, out of the ratio
            </p>
          ) : null}
          {result.failedGates.length > 0 ? (
            <p className="mt-3 rounded-md bg-fail/10 px-3 py-2 text-center text-xs text-fail">
              {result.failedGates.map(labelFor).join(', ')} — non-negotiable, missed.
            </p>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Panel
            title={templateLabel(day.template, savedTemplates)}
            icon="day"
            action={
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted">
                  anchored {toHHMM(day.anchorAt)}
                </span>
                <Pill tone={tone}>{bandWord}</Pill>
              </span>
            }
          >
            <DayBar
              blocks={day.blocks}
              now={now}
              detailed
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
          </Panel>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-edge bg-edge">
            {[
              {
                label: 'Contained',
                value: tally.percent === null ? '\u2014' : `${tally.percent}%`,
                sub: `${tally.contained} of ${tally.total} answered`,
              },
              { label: 'Blocks', value: String(actionable.length), sub: 'laid today' },
              {
                label: 'Pushed',
                value: day.pushes.length === 0 ? '\u2014' : `${day.pushes.length}\u00d7`,
                sub:
                  day.pushes.length === 0
                    ? 'no boundaries moved'
                    : formatDuration(pushedMinutes) + ' in total',
              },
            ].map((cell) => (
              <div key={cell.label} className="bg-panel px-4 py-3.5">
                <p className="text-[11px] uppercase tracking-block text-muted">{cell.label}</p>
                <p className="mt-1.5 font-mono text-xl font-semibold text-text">{cell.value}</p>
                <p className="mt-0.5 text-xs text-muted">{cell.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {day.degradation.length > 0 ? (
        <Card className="space-y-0.5 bg-sunk">
          {day.degradation.map((line) => (
            <p key={line} className="text-xs text-soft">
              {line}
            </p>
          ))}
        </Card>
      ) : null}

      {/* The timeline: every block, its commitments, and what happened in it. */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <SectionTitle>Timeline</SectionTitle>
          <div>
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
                onEditCommitment={(id, edit) => void editCommitment(id, edit)}
                placementMode={day.placementMode}
              />
            ))}
          </div>

          {unattached.length > 0 ? (
            <div className="mt-5">
              <SectionTitle>No block</SectionTitle>
              <Card>
                {unattachedMinutes > 0 ? (
                  <p className="mb-3 flex items-start gap-2 text-xs text-muted">
                    <Icon name="alert" size={13} className="mt-px shrink-0" />
                    <span>
                      {formatDuration(unattachedMinutes)} with no slot in the day, counted in
                      the totals above. Either never placed, or on a block a re-lay dropped.
                    </span>
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-muted">All dropped, so none of this is owed.</p>
                )}
                <div className="-my-1">
                  {unattached.map((commitment) => (
                    <CommitmentRow
                      key={commitment.id}
                      commitment={commitment}
                      onDone={(done) => void setDone(commitment.id, done)}
                      onDrop={(reason, displacedBy) =>
                        void dropCommitment(commitment.id, reason, displacedBy)
                      }
                      onRemove={() => void removeCommitment(commitment.id)}
                      onEdit={(edit) => void editCommitment(commitment.id, edit)}
                    />
                  ))}
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        {/* Everything that changes the shape of the day, kept out of the timeline. */}
        <aside className="space-y-4">
          <Panel title="Re-plan" icon="plan">
            <Button
              icon="calendar"
              className="w-full justify-start"
              onClick={() => setRelaying(true)}
            >
              Re-lay the rest of the day
            </Button>
            <p className="mt-1.5 text-xs text-muted">
              Re-arrange what has not happened yet. Everything already marked stays as it is.
            </p>

            {resetting ? (
              <div className="mt-4 rounded-lg border border-fail/40 bg-fail/5 p-3">
                <p className="text-sm text-text">Start the day over from Start day.</p>
                <p className="mt-1 text-xs text-soft">
                  Discards the current layout and every block mark on it. Your commitments and
                  today’s plan are kept, and the restart is recorded on the day.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      void resetDay(now);
                      setResetting(false);
                    }}
                  >
                    Discard the layout
                  </Button>
                  <Button size="sm" onClick={() => setResetting(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="mt-3 w-full justify-start"
                  onClick={() => setResetting(true)}
                >
                  Start the day over
                </Button>
                <p className="mt-1.5 text-xs text-muted">
                  Back to Start day. Commitments are kept; the layout is discarded.
                </p>
              </>
            )}
          </Panel>

          <button
            type="button"
            role="switch"
            aria-checked={day.placementMode}
            aria-label="Placement mode"
            onClick={() => void setPlacementMode(!day.placementMode)}
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              day.placementMode ? 'border-signal bg-wash' : 'border-edge bg-panel hover:bg-sunk'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                  day.placementMode ? 'border-signal bg-signal text-panel' : 'border-edge'
                }`}
              >
                {day.placementMode ? <Icon name="check" size={11} /> : null}
              </span>
              <span className="text-sm font-medium text-text">Placement mode</span>
            </span>
            <span className="mt-2 block text-xs leading-relaxed text-soft">
              Drops default to displaced, weekly targets re-pace around the day, and the grid
              marks it. A day in an interview is not a lapse in discipline.
            </span>
          </button>
        </aside>
      </section>
    </div>
  );
}
