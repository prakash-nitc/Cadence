import type { ScheduledBlock } from '../engine/layout';
import { formatDuration, toHHMM } from '../lib/time';

/**
 * Block containment — SPEC §3.3.
 *
 * Full-width, two taps, no free text. It measures whether boundaries get respected,
 * which is a different question from whether the work got done, and it is the metric
 * that says whether the schedule is real or decorative.
 */
interface ContainmentPromptProps {
  block: ScheduledBlock;
  now: number;
  onAnswer: (status: 'contained' | 'overran') => void;
}

export function ContainmentPrompt({ block, now, onAnswer }: ContainmentPromptProps) {
  const over = Math.max(0, Math.round((now - block.endsAt) / 60_000));

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
          onClick={() => onAnswer('contained')}
          className="border border-pass px-3 py-3 text-sm text-pass hover:bg-pass/10"
        >
          Stopped on time
        </button>
        <button
          type="button"
          onClick={() => onAnswer('overran')}
          className="border border-fail px-3 py-3 text-sm text-fail hover:bg-fail/10"
        >
          Ran over
        </button>
      </div>
    </section>
  );
}
