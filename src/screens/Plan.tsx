import { useEffect, useMemo, useState } from 'react';
import { BlockBuilder } from '../components/BlockBuilder';
import { CommitmentRow } from '../components/CommitmentRow';
import { Icon } from '../components/ui/Icon';
import { Button, Card, Empty, SectionTitle } from '../components/ui/primitives';

/** One input treatment across the screen — §31. */
const FIELD =
  'mt-1 w-full rounded-md border border-edge bg-panel px-3 py-2 text-sm text-text ' +
  'transition-shadow placeholder:text-muted focus:border-signal focus:shadow-focus focus:outline-none';
import { PlanItemRow } from '../components/PlanItemRow';
import { TemplatePicker } from '../components/TemplatePicker';
import { containment } from '../engine/boundaries';
import { checkFeasibility, committableMinutes } from '../engine/feasibility';
import { verdictLine } from '../lib/copy';
import { suggestionsFor } from '../lib/roadmap';
import type { Prefs } from '../lib/prefs';
import { blocksForTemplate, suggestedTemplate } from '../lib/templates';
import { addDays, formatDuration } from '../lib/time';
import { availableMinutes } from '../engine/capacity';
import type { BlockDef } from '../config/schedule.config';
import { useDay } from '../store/dayStore';
import { usePlan, type PlanItem } from '../store/planStore';

/**
 * Plan and log — SPEC §3.4. Two parts, one sitting, target under three minutes.
 *
 * Every field is prefilled from what the app already knows and every line of tomorrow's
 * plan arrives pre-selected, so the interaction is editing rather than composing. If
 * this takes longer than three minutes the user stops doing it, and then nothing else
 * in the app works.
 */
const ENERGY_LEVELS = [1, 2, 3, 4, 5] as const;

export function Plan({ now, prefs }: { now: number; prefs: Prefs }) {
  const { date, day, commitments, savedTemplates, setDone, dropCommitment } = useDay();
  const {
    tomorrow,
    carryOver,
    history,
    problemsDone,
    todayLog,
    lastLog,
    loaded,
    load,
    saveLog,
    savePlan,
  } = usePlan();

  useEffect(() => {
    if (date) void load(date, prefs);
  }, [date, prefs, load]);

  const tally = containment(day?.blocks ?? []);

  // ── Part 1: log today, every field prefilled ──────────────────────────────
  const recallComplete = commitments.some(
    (commitment) => commitment.tags.includes('recall') && commitment.status === 'complete',
  );
  const [recallDone, setRecallDone] = useState<boolean | null>(null);
  const [sleep, setSleep] = useState('');
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [hardest, setHardest] = useState('');
  const [logSaved, setLogSaved] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setRecallDone(todayLog?.recallDrillDone ?? recallComplete);
    setSleep(String(todayLog?.sleepHours ?? lastLog?.sleepHours ?? 7));
    setEnergy(todayLog?.energy ?? null);
    setHardest(todayLog?.hardestThing ?? '');
  }, [loaded, todayLog, lastLog, recallComplete]);

  // ── Part 2: tomorrow, pre-composed ────────────────────────────────────────
  const defaultTemplate = useMemo(
    () => (tomorrow ? suggestedTemplate(addDays(new Date(`${tomorrow}T09:00:00`), 0)) : 'full'),
    [tomorrow],
  );
  const [templateId, setTemplateId] = useState<string>(defaultTemplate);
  useEffect(() => setTemplateId(defaultTemplate), [defaultTemplate]);

  // The wake time the plan assumes. Not the anchor — that is still whenever Start day is
  // actually tapped tomorrow — but without it the plan cannot show real clock times, and
  // "which slot" is not answerable.
  //
  // Seeded from `dayStartsAt` rather than a literal. It was hardcoded to 05:45, so
  // changing when your day starts moved Start day and left every plan you made for
  // tomorrow laid out from a time you had already told the app was wrong.
  const [wakeAt, setWakeAt] = useState(prefs.dayStartsAt);
  useEffect(() => setWakeAt(prefs.dayStartsAt), [prefs.dayStartsAt]);

  const seeded = useMemo(
    () => blocksForTemplate(templateId, savedTemplates) ?? [],
    [templateId, savedTemplates],
  );

  // Arranged blocks are the plan. A template only seeds them.
  const [templateBlocks, setTemplateBlocks] = useState<BlockDef[]>(seeded);
  useEffect(() => setTemplateBlocks(seeded), [seeded]);

  const plannedAnchor = useMemo(() => {
    const parsed = new Date(`${tomorrow ?? '2026-01-01'}T${wakeAt}:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [tomorrow, wakeAt]);

  const composed = useMemo<PlanItem[]>(() => {
    if (!tomorrow) return [];
    const minutesOf = new Map(templateBlocks.map((block) => [block.id, block.minutes]));

    // Carry-overs first, pre-selected, with their move counts — SPEC §3.4.
    const carried: PlanItem[] = carryOver.map((commitment) => ({
      key: `carry:${commitment.id}`,
      source: 'carry',
      carriedFrom: commitment,
      blockId: commitment.blockId,
      label: commitment.label,
      targetType: commitment.targetType,
      target: commitment.target,
      plannedMinutes: commitment.plannedMinutes,
      tags: commitment.tags,
      selected: true,
      movedCount: commitment.movedCount,
      detail: null,
    }));

    const carriedBlocks = new Set(carried.map((item) => item.blockId));
    const priorityOf = new Map(templateBlocks.map((block) => [block.id, block.priority]));
    const orderOf = new Map(templateBlocks.map((block, index) => [block.id, index]));

    const suggested: PlanItem[] = suggestionsFor(
      templateBlocks.map((block) => block.id),
      tomorrow,
      problemsDone,
    )
      // A carry-over already owns its block; do not suggest the same slot twice.
      .filter((suggestion) => !carriedBlocks.has(suggestion.blockId))
      .map((suggestion) => ({
        key: `suggest:${suggestion.blockId}`,
        source: 'suggestion' as const,
        carriedFrom: null,
        blockId: suggestion.blockId,
        label: suggestion.label,
        targetType: suggestion.targetType,
        target: suggestion.target,
        plannedMinutes: minutesOf.get(suggestion.blockId) ?? 0,
        tags: suggestion.tags,
        selected: false,
        movedCount: 0,
        detail: suggestion.detail,
      }));

    // Suggestions "fill the rest" (SPEC §3.4) — up to the slack line, not past it.
    // Claiming every work block at its full length would put every plan over slack by
    // construction, and a warning that fires every night is noise rather than signal.
    //
    // Filled most-protected first and stopped at the first thing that does not fit,
    // rather than skipping it to squeeze in something smaller: letting a priority 2
    // block in because a priority 1 block was too big inverts the whole protection
    // order. Whatever is left over stays on screen, unticked, one tap away.
    const slack = Math.round(committableMinutes(templateBlocks) * prefs.planningSlack);
    let running = carried.reduce((sum, item) => sum + item.plannedMinutes, 0);

    const byProtection = [...suggested].sort((a, b) => {
      const byPriority =
        (priorityOf.get(a.blockId ?? '') ?? 3) - (priorityOf.get(b.blockId ?? '') ?? 3);
      if (byPriority !== 0) return byPriority;
      return (orderOf.get(a.blockId ?? '') ?? 0) - (orderOf.get(b.blockId ?? '') ?? 0);
    });

    for (const item of byProtection) {
      if (running + item.plannedMinutes > slack) break;
      item.selected = true;
      running += item.plannedMinutes;
    }

    return [...carried, ...suggested];
  }, [tomorrow, carryOver, templateBlocks, problemsDone, prefs.planningSlack]);

  const [items, setItems] = useState<PlanItem[]>([]);
  useEffect(() => setItems(composed), [composed]);

  const patch = (key: string, change: Partial<PlanItem>): void =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );

  const chosen = items.filter((item) => item.selected);
  const verdict = checkFeasibility(
    chosen.map((item) => ({
      id: item.key,
      label: item.label,
      target: item.target,
      plannedMinutes: item.plannedMinutes,
      tags: item.tags,
    })),
    committableMinutes(templateBlocks),
    history,
    prefs,
  );

  const [planSaved, setPlanSaved] = useState(false);
  useEffect(() => setPlanSaved(false), [items, templateId]);

  if (!date || !loaded) return <p className="text-sm text-muted">Loading.</p>;

  const canSaveLog = energy !== null && recallDone !== null;

  return (
    <div className="space-y-6">

      {/* ── Part 1: what actually happened ────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <SectionTitle>Log today</SectionTitle>
          {commitments.length > 0 ? (
            <Card>
              <p className="mb-2 text-xs text-muted">
                Tapped through the day. Confirm, or fix what is wrong.
              </p>
              <div className="-my-1">
                {commitments.map((commitment) => (
                  <CommitmentRow
                    key={commitment.id}
                    commitment={commitment}
                    onDone={(done) => void setDone(commitment.id, done)}
                    onDrop={(reason, displacedBy) =>
                      void dropCommitment(commitment.id, reason, displacedBy)
                    }
                  />
                ))}
              </div>
            </Card>
          ) : (
            <Empty
              icon="target"
              title="Nothing committed today"
              body="There is nothing to confirm. Commitments are added on the Day screen, against the blocks they belong to."
            />
          )}
        </div>

        <div>
          <SectionTitle>Day reflection</SectionTitle>
          <Card className="space-y-4">
            <div>
              <p className="text-xs text-muted">Blocks contained</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-text">
                {tally.contained}
                <span className="text-base text-muted"> of {tally.total}</span>
              </p>
            </div>

            <div>
              <p className="text-xs text-muted">Recall drill</p>
              <div className="mt-1.5 inline-flex rounded-md border border-edge p-1">
                {[true, false].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setRecallDone(value)}
                    className={`rounded-sm px-4 py-1 text-xs transition-colors ${
                      recallDone === value
                        ? 'bg-wash font-medium text-deep'
                        : 'text-soft hover:text-text'
                    }`}
                  >
                    {value ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs text-muted">Sleep hours</span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={sleep}
                onChange={(event) => setSleep(event.target.value)}
                className={`${FIELD} font-mono`}
              />
            </label>

            <div>
              <span className="text-xs text-muted">Energy</span>
              <div className="mt-1.5 flex gap-1.5">
                {ENERGY_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setEnergy(level)}
                    aria-label={`Energy ${level}`}
                    className={`flex-1 rounded-md border py-2 font-mono text-sm transition-colors ${
                      energy === level
                        ? 'border-signal bg-wash font-semibold text-deep'
                        : 'border-edge text-soft hover:border-muted'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

        <label className="block">
          <span className="block text-xs text-muted">Hardest thing today</span>
          <input
            value={hardest}
            onChange={(event) => setHardest(event.target.value)}
            className={FIELD}
          />
        </label>

        <Button
          variant="primary"
          size="lg"
          icon="check"
          className="w-full"
          disabled={!canSaveLog}
          onClick={() => {
            void saveLog(
              date,
              {
                recallDrillDone: recallDone ?? false,
                sleepHours: Number(sleep) || 0,
                energy: energy ?? 3,
                hardestThing: hardest.trim(),
                blocksContained: tally.contained,
                blocksTotal: tally.total,
              },
              now,
            );
            setLogSaved(true);
          }}
        >
          {logSaved ? 'Log saved' : 'Save log'}
        </Button>
            {!canSaveLog ? (
              <p className="text-xs text-muted">
                Energy is the one field the app cannot guess.
              </p>
            ) : null}
          </Card>
        </div>
      </section>

      {/* ── Part 2: tomorrow ─────────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-edge pt-6">
        <SectionTitle
          action={<span className="font-mono text-xs text-muted">{tomorrow}</span>}
        >
          Plan tomorrow
        </SectionTitle>

        <Card className="grid gap-4 sm:grid-cols-[11rem_1fr] sm:items-center">
          <label className="block">
            <span className="text-xs text-muted">Wake at</span>
            <input
              type="time"
              value={wakeAt}
              onChange={(event) => setWakeAt(event.target.value)}
              aria-label="Wake at"
              className={`${FIELD} font-mono text-lg`}
            />
          </label>
          <p className="text-xs leading-relaxed text-soft">
            The plan assumes this. Tomorrow the day still starts when you tap Start day —
            this only decides the shape and shows you the real times.
          </p>
        </Card>

        <div>
          <SectionTitle>Start from</SectionTitle>
          <p className="-mt-1 mb-2 text-xs text-muted">
            An ideal day to work from. Arrange it below into the day you actually want.
          </p>
          <TemplatePicker
            value={templateId}
            saved={savedTemplates}
            onChange={setTemplateId}
            suggested={defaultTemplate}
          />
        </div>

        <div>
          <SectionTitle>Tomorrow, slot by slot</SectionTitle>
          <BlockBuilder
            blocks={templateBlocks}
            onChange={setTemplateBlocks}
            anchor={plannedAnchor}
            availableMinutes={availableMinutes(plannedAnchor, prefs.dayEnd)}
          />
        </div>

        <SectionTitle>What gets finished</SectionTitle>
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing suggested for these blocks. You can add commitments tomorrow on the Day
            screen.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-edge bg-panel">
            {/* The two number columns are otherwise unlabelled boxes. */}
            <div className="flex items-center gap-3 border-b border-edge bg-sunk px-3 py-2">
              <span className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-xs text-muted">Commitment</span>
              <span className="w-16 shrink-0 text-right text-xs text-muted">Target</span>
              <span className="w-16 shrink-0 text-right text-xs text-muted">Weight</span>
            </div>
            {items.map((item) => (
              <PlanItemRow
                key={item.key}
                item={item}
                first={false}
                maxMoves={prefs.maxCarryOverMoves}
                note={verdict.notes.find((entry) => entry.commitmentId === item.key) ?? null}
                onToggle={() => patch(item.key, { selected: !item.selected })}
                onTarget={(target) => patch(item.key, { target })}
                onMinutes={(plannedMinutes) => patch(item.key, { plannedMinutes })}
                onDoFirst={() => {
                  const firstWork = templateBlocks.find((block) => block.kind === 'work');
                  patch(item.key, {
                    selected: true,
                    ...(firstWork
                      ? { blockId: firstWork.id, plannedMinutes: firstWork.minutes }
                      : {}),
                  });
                }}
                onDelete={() => setItems((c) => c.filter((entry) => entry.key !== item.key))}
              />
            ))}
          </div>
        )}

        <div
          className={`rounded-lg border p-4 ${
            verdict.status === 'within' ? 'border-edge bg-panel' : 'border-warn/50 bg-warn/5'
          }`}
        >
          <p
            className={`flex items-center gap-2 font-mono text-sm ${
              verdict.status === 'within' ? 'text-soft' : 'text-warn'
            }`}
          >
            {verdict.status === 'within' ? null : <Icon name="alert" size={14} />}
            {verdictLine(verdict)}
          </p>
          {verdict.status !== 'within' ? (
            <p className="mt-1 text-xs text-muted">
              Over by {formatDuration(verdict.overBy)}. This warns; it does not block.
            </p>
          ) : null}
          {!verdict.historyReady ? (
            <p className="mt-1 text-xs text-muted">
              {verdict.historyDays} of {prefs.historyWindowDays} days logged. Your own record
              gets quoted here once there is enough of it.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => {
            void savePlan(templateId, items, now, { blocks: templateBlocks, wakeAt });
            setPlanSaved(true);
          }}
          className="w-full border border-signal bg-signal/10 py-3 font-display text-base tracking-display text-signal hover:bg-signal/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
        >
          {planSaved
            ? `Plan saved — ${chosen.length} commitments for tomorrow`
            : `Save plan — ${chosen.length} ${chosen.length === 1 ? 'commitment' : 'commitments'}`}
        </button>
        {chosen.length === 0 ? (
          <p className="text-xs text-muted">
            Tomorrow needs at least one commitment. An unplanned day scores red whatever gets
            done.
          </p>
        ) : null}
      </section>
    </div>
  );
}
