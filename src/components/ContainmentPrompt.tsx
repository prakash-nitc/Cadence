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
 */
interface ContainmentPromptProps {
  block: ScheduledBlock;
  now: number;
  onAnswer: (status: 'contained' | 'overran', worked?: number) => void;
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
    <section className="border border-edge bg-panel p-4">
      <p className="font-display text-lg tracking-display text-text">Did you stop?</p>
      <p className="mt-1 text-sm text-muted">
        {block.label} ended at {toHHMM(block.endsAt)}
        {over > 0 ? ` — ${formatDuration(over)} ago` : ''}.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => pick('contained')}
          className="border border-pass px-3 py-3 text-sm text-pass hover:bg-pass/10"
        >
          Stopped on time
        </button>
        <button
          type="button"
          onClick={() => pick('overran')}
          className="border border-fail px-3 py-3 text-sm text-fail hover:bg-fail/10"
        >
          Ran over
        </button>
      </div>
    </section>
  );
}
