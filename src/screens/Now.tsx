import { useState } from 'react';
import { RULES } from '../config/schedule.config';
import { CommitmentRow } from '../components/CommitmentRow';
import { ContainmentPrompt } from '../components/ContainmentPrompt';
import {
  CurrentBlockHero,
  DailyMetrics,
  NextBlock,
  PaceCard,
  RuleCard,
} from '../components/now/NowParts';
import { Icon } from '../components/ui/Icon';
import { Button, Card, Empty, Panel } from '../components/ui/primitives';
import { StartDay } from '../components/StartDay';
import { Triage } from '../components/Triage';
import {
  blockAt,
  containment,
  freeMinutesUntilNext,
  isDayComplete,
  isResolved,
  nextBlock,
  unconfirmed,
} from '../engine/boundaries';
import { burnDown, projectDay } from '../engine/scoring';
import { backupState, freeTimeLine, pullForwardWarning, ruleForDate } from '../lib/copy';
import { blockPassed, blockPriority, gateLabel, runwayMinutes, unslotted } from '../lib/dayScoring';
import type { Prefs } from '../lib/prefs';
import { formatDuration, toHHMM } from '../lib/time';
import { useDay } from '../store/dayStore';

const PUSH_OPTIONS = [15, 30, 60];

/** Now — SPEC §3.1. Read at arm's length in under two seconds. */
export function Now({ now, prefs }: { now: number; prefs: Prefs }) {
  const {
    date,
    day,
    commitments,
    savedTemplates,
    startDay,
    saveTemplate,
    closeBlock,
    skipBlock,
    push,
    startNextEarly,
    setDone,
    dropCommitment,
    editCommitment,
  } = useDay();
  const [confirmingEarly, setConfirmingEarly] = useState(false);
  const [triaging, setTriaging] = useState(false);

  if (!date) return null;

  if (!day?.anchorAt) {
    return (
      <StartDay
        date={date}
        now={now}
        prefs={prefs}
        saved={savedTemplates}
        planned={day?.plannedAt != null}
        plannedBlocks={day?.plannedBlocks ?? null}
        plannedAnchor={day?.plannedAnchor ?? null}
        commitmentCount={commitments.length}
        onStart={(anchor, templateId, blocks, settle) =>
          void startDay(anchor, templateId, prefs, blocks, settle)
        }
        onSaveTemplate={(name, blocks) => void saveTemplate(name, blocks, now)}
      />
    );
  }

  const waiting = unconfirmed(day.blocks, now);
  const current = blockAt(day.blocks, now);
  const next = nextBlock(day.blocks, now);
  const free = freeMinutesUntilNext(day.blocks, now);
  const rule = ruleForDate(RULES, date);
  const planned = day.plannedAt !== null;

  const running = current && !isResolved(current) && current.kind !== 'gap' ? current : null;

  // While the past is unanswered the prompt owns the screen, but the block that is
  // actually running still gets named — otherwise Now reports the wrong thing to do.
  const inProgress = waiting.length === 0 ? running : null;
  const heldBack = waiting.length > 0 && running && running !== waiting[0] ? running : null;

  const runway = runwayMinutes(day.blocks, now);
  const passed = blockPassed(day.blocks, now);
  const burn = burnDown(commitments, runway, passed);
  // Measured the same way as the burn-down itself, so the two numbers are comparable.
  const unslottedMinutes = burnDown(unslotted(commitments, day.blocks), 0).committedMinutes;
  // Chronological, so the projection credits work in the order it will actually be done,
  // and capped by the runway so it cannot claim more than the day can still hold.
  const startOf = new Map(day.blocks.map((block) => [block.blockId, block.startsAt]));
  const inDayOrder = [...commitments].sort(
    (a, b) => (startOf.get(a.blockId ?? '') ?? 0) - (startOf.get(b.blockId ?? '') ?? 0),
  );
  const projected = projectDay(
    inDayOrder,
    prefs,
    planned,
    passed,
    runway,
  );
  const labelFor = gateLabel(commitments, day.blocks);
  const tally = containment(day.blocks);
  const backup = backupState(prefs.lastBackupAt, prefs.backupReminderDays, now);

  const blockCommitments = (blockId: string): typeof commitments =>
    commitments.filter((commitment) => commitment.blockId === blockId);

  if (triaging) {
    return (
      <Triage
        commitments={commitments}
        prefs={prefs}
        planned={planned}
        availableMinutes={runway}
        priorityOf={blockPriority(day.blocks)}
        labelFor={labelFor}
        onDone={(id, done) => void setDone(id, done)}
        onDrop={(id, reason, displacedBy) => void dropCommitment(id, reason, displacedBy)}
        onClose={() => setTriaging(false)}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Main column: what you are doing, and what you can do about it. */}
      <div className="space-y-5">
        {waiting[0] ? (
          <ContainmentPrompt
            block={waiting[0]}
            now={now}
            onAnswer={(status) => void closeBlock(waiting[0]!.blockId, status, now)}
          />
        ) : null}

        {inProgress ? (
          <>
            <CurrentBlockHero block={inProgress} now={now} />

            {blockCommitments(inProgress.blockId).length > 0 ? (
              <Panel title="Committed to this block" icon="target">
                <div className="-my-1">
                  {blockCommitments(inProgress.blockId).map((commitment) => (
                    <CommitmentRow
                      key={commitment.id}
                      commitment={commitment}
                      onDone={(done) => void setDone(commitment.id, done)}
                      onDrop={(reason, displacedBy) =>
                        void dropCommitment(commitment.id, reason, displacedBy)
                      }
                      onEdit={(edit) => void editCommitment(commitment.id, edit)}
                    />
                  ))}
                </div>
              </Panel>
            ) : inProgress.detail ? (
              <Card className="text-sm text-soft">{inProgress.detail}</Card>
            ) : null}

            {/*
              The one dominant action, and the ways out of it. Done is green-grounded and
              comes first; skip is neutral. Push and triage sit below a rule as secondary,
              because reaching for them should feel like the smaller decision it is.
            */}
            <Card>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  icon="check"
                  onClick={() => void closeBlock(inProgress.blockId, 'contained', now)}
                >
                  Done — contained
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  icon="skip"
                  onClick={() => void skipBlock(inProgress.blockId, now)}
                >
                  Skip block
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-4">
                <span className="text-xs text-muted">Push remaining</span>
                {PUSH_OPTIONS.map((minutes) => (
                  <Button
                    key={minutes}
                    size="sm"
                    variant="secondary"
                    className="font-mono"
                    onClick={() => void push(minutes, now)}
                  >
                    +{minutes}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  icon="chart"
                  className="ml-auto"
                  onClick={() => setTriaging(true)}
                >
                  Triage day
                </Button>
              </div>
            </Card>
          </>
        ) : null}

        {!inProgress && waiting.length === 0 ? (
          <Card className="p-6">
            {isDayComplete(day.blocks) ? (
              <>
                <h2 className="font-display text-2xl font-semibold tracking-display text-text">
                  Day worked
                </h2>
                <p className="mt-1 text-sm text-soft">
                  Every block is marked. Log it in the Plan tab.
                </p>
              </>
            ) : next ? (
              <>
                <p className="eyebrow">Between blocks</p>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-display text-text">
                  {freeTimeLine(free, next.label)}
                </h2>
                <p className="mt-1 text-sm text-soft">
                  The boundary does not move on its own. This time is free, not lost.
                </p>

                {confirmingEarly ? (
                  <div className="mt-4 rounded-lg border border-warn/50 bg-warn/5 p-4">
                    <p className="text-sm text-text">{pullForwardWarning(free)}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        onClick={() => {
                          void startNextEarly(free, now);
                          setConfirmingEarly(false);
                        }}
                        className="border-warn/50 text-warn hover:bg-warn/10"
                      >
                        Move them
                      </Button>
                      <Button onClick={() => setConfirmingEarly(false)}>
                        Keep the boundaries
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button className="mt-4" onClick={() => setConfirmingEarly(true)}>
                    Start next block early
                  </Button>
                )}
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-semibold tracking-display text-text">
                  Nothing scheduled
                </h2>
                <p className="mt-1 text-sm text-soft">The day ran out of blocks.</p>
              </>
            )}
          </Card>
        ) : null}

        {commitments.length > 0 ? (
          <DailyMetrics
            committed={burn.committedMinutes}
            remaining={burn.availableMinutes}
            contained={tally.percent}
            pushed={day.pushes.length}
            stranded={burn.strandedMinutes}
          />
        ) : (
          <Empty
            icon="target"
            title="Nothing committed to today"
            body="A day with no commitments scores red whatever gets done. Add them on the Day screen, against the blocks they belong to."
          />
        )}

        {unslottedMinutes > 0 ? (
          <p className="px-1 text-xs text-muted">
            {formatDuration(unslottedMinutes)} of that has no block, under “No block” on Day.
          </p>
        ) : null}
      </div>

      {/* Summary column: am I on pace, what is next, what is the standing rule. */}
      <aside className="space-y-5">
        <PaceCard result={projected} labelFor={labelFor} />

        {heldBack ? (
          <Card>
            <p className="eyebrow">Running now</p>
            <p className="mt-2 text-sm text-text">{heldBack.label}</p>
            <p className="mt-0.5 font-mono text-xs text-muted">
              until {toHHMM(heldBack.endsAt)}
            </p>
          </Card>
        ) : (
          <NextBlock block={next} />
        )}

        {rule ? <RuleCard rule={rule} /> : null}

        {backup.overdue ? (
          <p className="flex items-start gap-2 px-1 text-xs text-muted">
            <Icon name="download" size={13} className="mt-px shrink-0" />
            <span>
              {backup.line} Everything is in this browser only — export it from Settings.
            </span>
          </p>
        ) : null}
      </aside>
    </div>
  );
}
