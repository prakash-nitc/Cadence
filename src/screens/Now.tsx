import { useState } from 'react';
import { RULES } from '../config/schedule.config';
import { BurnDown } from '../components/BurnDown';
import { CommitmentRow } from '../components/CommitmentRow';
import { BlockProgress, Countdown } from '../components/Countdown';
import { ContainmentPrompt } from '../components/ContainmentPrompt';
import { ScoreBadge } from '../components/ScoreBadge';
import { StartDay } from '../components/StartDay';
import { Triage } from '../components/Triage';
import {
  blockAt,
  freeMinutesUntilNext,
  isDayComplete,
  isResolved,
  nextBlock,
  unconfirmed,
} from '../engine/boundaries';
import { burnDown, projectDay } from '../engine/scoring';
import { freeTimeLine, pullForwardWarning, ruleForDate } from '../lib/copy';
import { blockPassed, blockPriority, gateLabel, runwayMinutes } from '../lib/dayScoring';
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
        commitmentCount={commitments.length}
        onStart={(anchor, templateId, blocks) =>
          void startDay(anchor, templateId, prefs, blocks)
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
  const burn = burnDown(commitments, runway);
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
    blockPassed(day.blocks, now),
    runway,
  );
  const labelFor = gateLabel(commitments, day.blocks);

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
    <div className="space-y-6">
      {waiting[0] ? (
        <ContainmentPrompt
          block={waiting[0]}
          now={now}
          onAnswer={(status) => void closeBlock(waiting[0]!.blockId, status, now)}
        />
      ) : null}

      {inProgress ? (
        <section>
          <p className="text-xs uppercase tracking-block text-muted">{inProgress.kind}</p>
          <h1 className="mt-1 font-display text-3xl tracking-display text-text">
            {inProgress.label}
          </h1>

          <div className="mt-4 flex items-baseline justify-between">
            <Countdown endsAt={inProgress.endsAt} now={now} className="text-5xl" />
            <span className="font-mono text-sm text-muted">
              {toHHMM(inProgress.startsAt)}–{toHHMM(inProgress.endsAt)}
            </span>
          </div>

          <div className="mt-3">
            <BlockProgress startsAt={inProgress.startsAt} endsAt={inProgress.endsAt} now={now} />
          </div>

          {blockCommitments(inProgress.blockId).length > 0 ? (
            <div className="mt-4 border-t border-edge pt-2">
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
          ) : inProgress.detail ? (
            <p className="mt-3 text-sm text-muted">{inProgress.detail}</p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void closeBlock(inProgress.blockId, 'contained', now)}
              className="border border-pass px-3 py-3 text-sm text-pass hover:bg-pass/10"
            >
              Done — contained
            </button>
            <button
              type="button"
              onClick={() => void skipBlock(inProgress.blockId, now)}
              className="border border-edge px-3 py-3 text-sm text-muted hover:border-fail hover:text-fail"
            >
              Skip block
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Push remaining</span>
            {PUSH_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => void push(minutes, now)}
                className="border border-edge px-2.5 py-1.5 font-mono text-xs text-muted hover:border-muted hover:text-text"
              >
                +{minutes}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTriaging(true)}
              className="ml-auto border border-edge px-2.5 py-1.5 text-xs text-muted hover:border-muted hover:text-text"
            >
              Triage day
            </button>
          </div>
        </section>
      ) : null}

      {!inProgress && waiting.length === 0 ? (
        <section>
          {isDayComplete(day.blocks) ? (
            <>
              <h1 className="font-display text-2xl tracking-display text-text">Day worked</h1>
              <p className="mt-1 text-sm text-muted">
                Every block is marked. Log it in the Plan tab.
              </p>
            </>
          ) : next ? (
            <>
              <h1 className="font-display text-2xl tracking-display text-text">
                {freeTimeLine(free, next.label)}
              </h1>
              <p className="mt-1 text-sm text-muted">
                The boundary does not move on its own. This time is free, not lost.
              </p>

              {confirmingEarly ? (
                <div className="mt-4 border border-warn bg-panel p-3">
                  <p className="text-sm text-text">{pullForwardWarning(free)}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void startNextEarly(free, now);
                        setConfirmingEarly(false);
                      }}
                      className="border border-warn px-3 py-2 text-sm text-warn"
                    >
                      Move them
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingEarly(false)}
                      className="border border-edge px-3 py-2 text-sm text-text"
                    >
                      Keep the boundaries
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingEarly(true)}
                  className="mt-4 border border-edge px-3 py-2 text-sm text-muted hover:border-muted hover:text-text"
                >
                  Start next block early
                </button>
              )}
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl tracking-display text-text">
                Nothing scheduled
              </h1>
              <p className="mt-1 text-sm text-muted">The day ran out of blocks.</p>
            </>
          )}
        </section>
      ) : null}

      {commitments.length > 0 ? (
        <section className="space-y-3 border-t border-edge pt-3">
          <BurnDown result={burn} onTriage={() => setTriaging(true)} />
          <ScoreBadge result={projected} labelFor={labelFor} projected />
        </section>
      ) : (
        <section className="border-t border-edge pt-3">
          <p className="text-sm text-muted">
            Nothing committed to today. A day with no commitments scores red whatever gets
            done — add them on the Day screen.
          </p>
        </section>
      )}

      {heldBack ? (
        <section className="border-t border-edge pt-3">
          <p className="text-xs uppercase tracking-block text-muted">Running now</p>
          <p className="mt-1 text-sm text-muted">
            {heldBack.label} — until <span className="font-mono">{toHHMM(heldBack.endsAt)}</span>
          </p>
        </section>
      ) : next ? (
        <section className="border-t border-edge pt-3">
          <p className="text-xs uppercase tracking-block text-muted">Next</p>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">{toHHMM(next.startsAt)}</span> {next.label} —{' '}
            {formatDuration(next.minutes)}
          </p>
        </section>
      ) : null}

      {rule ? (
        <section className="border-t border-edge pt-3">
          <p className="text-xs uppercase tracking-block text-muted">Rule</p>
          <p className="mt-1 text-sm text-text">{rule}</p>
        </section>
      ) : null}
    </div>
  );
}
