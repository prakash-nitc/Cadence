import { useState } from 'react';
import type { ScheduledBlock } from '../engine/layout';
import { defaultWorked } from '../engine/worked';
import { formatDuration, toHHMM } from '../lib/time';
import { WorkedPicker } from './WorkedPicker';

/**
 * Block containment — SPEC §3.3.
 *
 * Full-width, two taps, no free text. It measures whether boundaries get respected,
 * which is a different question from whether the work got done, and it is the metric
 * that says whether the schedule is real or decorative.
 *
 * A work block then asks the second question too — how long you worked — because that is
 * what the hours targets count, and nothing else in closing a block records it.
 *
 * Three answers, not two. With only "stopped on time" and "ran over", a block that never
 * happened had to be reported as one of them and then given a time — so a missed block
 * read as worked. "Didn't do it" skips it: no time is asked, none counts, and it counts
 * against containment the same as skipping it while it ran.
 */
interface ContainmentPromptProps {
  block: ScheduledBlock;
  now: number;
  /** `skipped` is a block that did not happen: no time is asked for, and none counts. */
  onAnswer: (status: 'contained' | 'overran' | 'skipped', worked?: number) => void;
}

export function ContainmentPrompt({ block, now, onAnswer }: ContainmentPromptProps) {
  const over = Math.max(0, Math.round((now - block.endsAt) / 60_000));
  const [answer, setAnswer] = useState<'contained' | 'overran' | null>(null);

  const pick = (status: 'contained' | 'overran') => {
    if (block.kind === 'work') setAnswer(status);
    else onAnswer(status);
  };

  if (answer) {
    return (
      <section className="card p-4">
        <WorkedPicker
          block={block}
          initial={defaultWorked(block, now)}
          onLog={(minutes) => onAnswer(answer, minutes)}
          onCancel={() => setAnswer(null)}
        />
      </section>
    );
  }

  return (
    <section className="card p-5">
      <p className="font-display text-lg tracking-display text-text">
        How did {block.label} go?
      </p>
      <p className="mt-1 text-sm text-muted">
        It ended at {toHHMM(block.endsAt)}
        {over > 0 ? ` — ${formatDuration(over)} ago` : ''}.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" data-containment>
        <button
          type="button"
          onClick={() => pick('contained')}
          className="rounded-md border border-pass px-3 py-3 text-left text-sm text-pass hover:bg-pass/10"
        >
          <span className="block font-medium">Stopped on time</span>
          <span className="mt-0.5 block text-xs text-soft">Did it, and stopped at the end</span>
        </button>
        <button
          type="button"
          onClick={() => pick('overran')}
          className="rounded-md border border-warn px-3 py-3 text-left text-sm text-warn hover:bg-warn/10"
        >
          <span className="block font-medium">Ran over</span>
          <span className="mt-0.5 block text-xs text-soft">Did it, kept going past the end</span>
        </button>
        <button
          type="button"
          onClick={() => onAnswer('skipped')}
          className="rounded-md border border-edge px-3 py-3 text-left text-sm text-text hover:bg-sunk"
        >
          <span className="block font-medium">Didn&apos;t do it</span>
          <span className="mt-0.5 block text-xs text-soft">Missed or skipped — no time counts</span>
        </button>
      </div>
    </section>
  );
}
