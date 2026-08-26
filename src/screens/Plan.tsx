import { useEffect, useMemo, useState } from 'react';
import { CommitmentRow } from '../components/CommitmentRow';
import { PlanItemRow } from '../components/PlanItemRow';
import { TemplatePicker } from '../components/TemplatePicker';
import { containment } from '../engine/boundaries';
import { checkFeasibility, committableMinutes } from '../engine/feasibility';
import { verdictLine } from '../lib/copy';
import { suggestionsFor } from '../lib/roadmap';
import type { Prefs } from '../lib/prefs';
import { blocksForTemplate, suggestedTemplate } from '../lib/templates';
import { addDays, formatDuration } from '../lib/time';
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

  const templateBlocks = useMemo(
    () => blocksForTemplate(templateId, savedTemplates) ?? [],
    [templateId, savedTemplates],
  );

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
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl tracking-display text-text">Log and plan</h1>
        <p className="mt-1 text-sm text-muted">
          Two parts, one sitting. Everything is filled in — change what is wrong.
        </p>
      </header>

      {/* ── Part 1 ──────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xs uppercase tracking-block text-muted">Log today</h2>

        {commitments.length > 0 ? (
          <div className="border border-edge bg-panel px-3 py-2">
            <p className="mb-1 text-xs text-muted">
              Tapped through the day. Confirm, or fix what is wrong.
            </p>
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
        ) : null}

        <dl className="grid grid-cols-2 gap-px border border-edge bg-edge">
          <div className="bg-panel px-3 py-2">
            <dt className="text-xs text-muted">Blocks contained</dt>
            <dd className="font-mono text-sm text-text">
              {tally.contained} of {tally.total}
            </dd>
          </div>
          <div className="bg-panel px-3 py-2">
            <dt className="text-xs text-muted">Recall drill</dt>
            <dd className="mt-0.5 flex gap-1">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setRecallDone(value)}
                  className={`border px-2 py-0.5 text-xs ${
                    recallDone === value ? 'border-signal text-signal' : 'border-edge text-muted'
                  }`}
                >
                  {value ? 'Yes' : 'No'}
                </button>
              ))}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-muted">Sleep hours</span>
            <input
              type="number"
              step="0.5"
              min="0"
              value={sleep}
              onChange={(event) => setSleep(event.target.value)}
              className="mt-1 w-full border border-edge bg-panel px-2 py-1.5 font-mono text-sm text-text focus:border-signal focus:outline-none"
            />
          </label>

          <div>
            <span className="block text-xs text-muted">Energy</span>
            <div className="mt-1 flex gap-1">
              {ENERGY_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setEnergy(level)}
                  aria-label={`Energy ${level}`}
                  className={`flex-1 border py-1.5 font-mono text-xs ${
                    energy === level ? 'border-signal text-signal' : 'border-edge text-muted'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="block text-xs text-muted">Hardest thing today</span>
          <input
            value={hardest}
            onChange={(event) => setHardest(event.target.value)}
            className="mt-1 w-full border border-edge bg-panel px-2 py-1.5 text-sm text-text focus:border-signal focus:outline-none"
          />
        </label>

        <button
          type="button"
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
          className="w-full border border-edge py-2.5 text-sm text-text hover:border-muted disabled:opacity-40"
        >
          {logSaved ? 'Log saved' : 'Save log'}
        </button>
        {!canSaveLog ? (
          <p className="text-xs text-muted">Energy is the one field the app cannot guess.</p>
        ) : null}
      </section>

      {/* ── Part 2 ──────────────────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-edge pt-6">
        <h2 className="text-xs uppercase tracking-block text-muted">
          Plan tomorrow — {tomorrow}
        </h2>

        <TemplatePicker
          value={templateId}
          saved={savedTemplates}
          onChange={setTemplateId}
          suggested={defaultTemplate}
        />

        {items.length === 0 ? (
          <p className="text-sm text-muted">
            No suggestions for this template. Add commitments on the Day screen tomorrow.
          </p>
        ) : (
          <div className="border border-edge bg-panel">
            {items.map((item, index) => (
              <PlanItemRow
                key={item.key}
                item={item}
                first={index === 0}
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
          className={`border p-3 ${
            verdict.status === 'within' ? 'border-edge' : 'border-warn'
          } bg-panel`}
        >
          <p
            className={`font-mono text-sm ${
              verdict.status === 'within' ? 'text-muted' : 'text-warn'
            }`}
          >
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
            void savePlan(templateId, items, now);
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
