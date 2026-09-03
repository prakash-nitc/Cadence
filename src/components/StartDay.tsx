import { useMemo, useState } from 'react';
import { FIXED_WINDOWS, type BlockDef } from '../config/schedule.config';
import type { SavedTemplate } from '../db/schema';
import { planDay } from '../engine/capacity';
import { layoutDay, type ScheduledBlock } from '../engine/layout';
import { describeDegradation } from '../lib/copy';
import type { Prefs } from '../lib/prefs';
import { blocksForTemplate, suggestedTemplate } from '../lib/templates';
import { formatDuration, toHHMM } from '../lib/time';
import { availableMinutes } from '../engine/capacity';
import { CustomDay } from './CustomDay';
import { TemplatePicker } from './TemplatePicker';
import { Icon } from './ui/Icon';
import { Button, Card, SectionTitle } from './ui/primitives';

/**
 * The unanchored state — SPEC §3.1. Start day, a template picker, and an honest account
 * of what has already happened.
 *
 * The anchor is when the *day* started, which is rarely when the laptop opened. Waking at
 * 06:30 and sitting down at 09:00 is not a 09:00 day: the morning routine happened, and
 * anchoring at the laptop lays Wake and Breakfast across the middle of the morning and
 * pushes everything two hours late.
 *
 * So the field is offered up front, seeded from `dayStartsAt`, with the gap to now stated
 * in words. §2.1 forbids *silently* backdating — this is the opposite of silent, and the
 * blocks the anchor puts in the past are then answered for in one pass rather than
 * arriving as a queue of containment prompts.
 */
interface StartDayProps {
  date: string;
  /** The arrangement decided last night, if there was one. */
  plannedBlocks: BlockDef[] | null;
  /** The wake time that plan assumed, to seed the picker. */
  plannedAnchor: string | null;
  now: number;
  prefs: Prefs;
  saved: SavedTemplate[];
  planned: boolean;
  /** Commitments already waiting on this day, planned the night before. */
  commitmentCount: number;
  onStart: (
    anchor: Date,
    templateId: string,
    blocks?: BlockDef[],
    settle?: Record<string, 'contained' | 'skipped'>,
  ) => void;
  onSaveTemplate: (name: string, blocks: BlockDef[]) => void;
}

const FIELD =
  'w-full rounded-md border border-edge bg-panel px-3 py-2 font-mono text-lg text-text ' +
  'transition-shadow focus:border-signal focus:shadow-focus focus:outline-none';

/** The kinds that reliably did happen if their time has passed. Work never assumes. */
const ASSUME_DONE = new Set(['routine', 'meal', 'break']);

/**
 * How far back the usual start time may be offered from.
 *
 * Two or three hours after waking is the ordinary case this exists for — shower,
 * breakfast, then the laptop. Opening at 23:00 is not that: it is a day already lost, and
 * pre-filling 06:30 there would tick five blocks that plausibly never happened. Past this,
 * the field falls back to now and the user has to claim the morning deliberately.
 */
const MAX_ASSUMED_GAP_MINUTES = 6 * 60;

export function StartDay({
  date,
  plannedBlocks,
  plannedAnchor,
  now,
  prefs,
  saved,
  planned,
  commitmentCount,
  onStart,
  onSaveTemplate,
}: StartDayProps) {
  const suggested = useMemo(() => suggestedTemplate(new Date(now)), [now]);
  const [templateId, setTemplateId] = useState<string>(suggested);
  const [building, setBuilding] = useState(false);

  /*
   * The default anchor: last night's plan if there was one, otherwise the usual start.
   * Only once the user picks does it stop tracking the clock — freezing at mount meant
   * leaving this screen open and tapping Start day 40 minutes later silently backdated
   * the day to whenever the screen happened to load.
   */
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const defaultTime = plannedAnchor ?? prefs.dayStartsAt;
  const gap = (now - Date.parse(`${date}T${defaultTime}:00`)) / 60_000;
  const offerUsual = gap > 0 && gap <= MAX_ASSUMED_GAP_MINUTES;
  const anchorTime = pickedTime ?? (offerUsual ? defaultTime : toHHMM(now));

  const anchor = useMemo(() => {
    const parsed = new Date(`${date}T${anchorTime}:00`);
    return Number.isNaN(parsed.getTime()) ? new Date(now) : parsed;
  }, [date, anchorTime, now]);

  const lateBy = Math.max(0, Math.round((now - anchor.getTime()) / 60_000));

  const template = useMemo(
    () => plannedBlocks ?? blocksForTemplate(templateId, saved),
    [plannedBlocks, templateId, saved],
  );

  /** The day as it would be laid, so "already happened" is the real list, not a guess. */
  const laid = useMemo<ScheduledBlock[]>(() => {
    if (!template) return [];
    return plannedBlocks
      ? layoutDay(anchor, plannedBlocks, FIXED_WINDOWS)
      : planDay(anchor, template, FIXED_WINDOWS, prefs).blocks;
  }, [template, plannedBlocks, anchor, prefs]);

  const past = useMemo(
    () => laid.filter((block) => block.kind !== 'gap' && block.endsAt <= now),
    [laid, now],
  );

  /** Ticked means contained. Seeded per kind and then owned by the user. */
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const answerFor = (block: ScheduledBlock): boolean =>
    answers[block.blockId] ?? ASSUME_DONE.has(block.kind);

  const preview = useMemo(() => {
    if (!template || plannedBlocks) return null;
    const { degradation } = planDay(anchor, template, FIXED_WINDOWS, prefs);
    return describeDegradation(degradation, anchor, prefs.gymCutoffHour);
  }, [template, plannedBlocks, anchor, prefs]);

  const start = (): void => {
    const settle: Record<string, 'contained' | 'skipped'> = {};
    for (const block of past) settle[block.blockId] = answerFor(block) ? 'contained' : 'skipped';
    const id = plannedBlocks ? 'planned' : templateId;
    onStart(anchor, id, plannedBlocks ?? undefined, past.length > 0 ? settle : undefined);
  };

  if (building) {
    return (
      <CustomDay
        seed={plannedBlocks ?? blocksForTemplate(templateId, saved) ?? []}
        anchor={anchor}
        availableMinutes={availableMinutes(anchor, prefs.dayEnd)}
        onUse={(blocks, label) => onStart(anchor, label, blocks)}
        onSaveTemplate={onSaveTemplate}
        onCancel={() => setBuilding(false)}
      />
    );
  }

  const doneCount = past.filter(answerFor).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className="p-6">
        <p className="eyebrow">Day not started</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-display text-text">
          When did your day start?
        </h1>
        <p className="mt-1 text-sm text-soft">
          {commitmentCount > 0
            ? `${commitmentCount} ${commitmentCount === 1 ? 'commitment' : 'commitments'} waiting. Anchoring lays the blocks out.`
            : planned
              ? 'Planned, with nothing committed to. Anchoring lays the blocks out.'
              : 'Not when you opened the laptop — when you actually got up.'}
        </p>

        {plannedAnchor && pickedTime === null ? (
          <p className="mt-2 font-mono text-xs text-muted">
            Planned to start at {plannedAnchor}.
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
          <input
            id="anchor-time"
            type="time"
            aria-label="Day started at"
            value={anchorTime}
            onChange={(event) => setPickedTime(event.target.value)}
            className={FIELD}
          />
          <p className="text-xs leading-relaxed text-soft">
            {lateBy > 0 ? (
              <>
                You are opening this at{' '}
                <span className="font-mono text-text">{toHHMM(now)}</span>, {formatDuration(lateBy)}{' '}
                later. The blocks before now land where they happened rather than being
                pushed into the afternoon.
              </>
            ) : gap > MAX_ASSUMED_GAP_MINUTES ? (
              <>
                Your usual{' '}
                <span className="font-mono text-text">{defaultTime}</span> is more than six
                hours ago, so this starts from now. Set it back only to a time you actually
                started.
              </>
            ) : (
              'Starting now. Set it back only to a time you actually started.'
            )}
          </p>
        </div>
      </Card>

      <section>
        <SectionTitle>{plannedBlocks ? 'Or start from something else' : 'Start from'}</SectionTitle>
        <p className="-mt-1 mb-2 text-xs text-muted">
          A template is the ideal day, not a rule. Take it as it is, or arrange it.
        </p>
        <TemplatePicker
          value={templateId}
          saved={saved}
          onChange={setTemplateId}
          suggested={suggested}
        />
      </section>

      {past.length > 0 ? (
        <section>
          <SectionTitle
            action={
              <span className="font-mono text-xs text-muted">
                {doneCount} of {past.length} contained
              </span>
            }
          >
            Already happened
          </SectionTitle>

          <Card flush>
            <p className="border-b border-edge px-5 py-3 text-xs text-soft">
              These fall before {toHHMM(now)}. Ticked is contained, unticked is skipped —
              answered once here instead of one prompt at a time.
            </p>

            <ul>
              {past.map((block) => {
                const done = answerFor(block);
                return (
                  <li key={block.blockId}>
                    <button
                      type="button"
                      onClick={() =>
                        setAnswers((current) => ({ ...current, [block.blockId]: !done }))
                      }
                      aria-pressed={done}
                      className="flex w-full items-center gap-3 border-b border-edge px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-sunk/60"
                    >
                      <span
                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                          done ? 'border-signal bg-signal text-panel' : 'border-edge'
                        }`}
                      >
                        {done ? <Icon name="check" size={12} /> : null}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm font-medium ${
                            done ? 'text-text' : 'text-muted line-through'
                          }`}
                        >
                          {block.label}
                        </span>
                        <span className="mt-0.5 block font-mono text-xs text-muted">
                          {toHHMM(block.startsAt)}–{toHHMM(block.endsAt)}
                          <span className="mx-1.5 text-edge">·</span>
                          {formatDuration(block.minutes)}
                          <span className="ml-2 font-sans capitalize">{block.kind}</span>
                        </span>
                      </span>

                      <span className={`shrink-0 text-xs ${done ? 'text-deep' : 'text-muted'}`}>
                        {done ? 'Contained' : 'Skipped'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}

      {preview ? (
        <Card className="space-y-0.5 bg-sunk">
          {preview.map((line) => (
            <p key={line} className="text-sm text-soft first:font-medium first:text-text">
              {line}
            </p>
          ))}
        </Card>
      ) : null}

      <div className="space-y-3">
        <Button variant="primary" size="lg" icon="check" className="w-full" onClick={start}>
          {plannedBlocks ? 'Start the day you planned' : 'Start day'}
        </Button>

        <Button className="w-full" onClick={() => setBuilding(true)}>
          Arrange the day first
        </Button>
      </div>
    </div>
  );
}
