/**
 * The shape of tomorrow — one big, two medium, three small.
 *
 * Deliberately a lens over the commitments already on the plan rather than a second
 * to-do list. Commitments are what Cadence scores; a parallel list would be work the
 * day never counts, and the two would disagree inside a week. Size comes from planned
 * minutes, which the app already holds, so nothing extra is asked for.
 */
import type { ShapeVerdict, Size } from '../../engine/shape';
import { Icon } from '../ui/Icon';
import type { Tone } from '../ui/primitives';

const ROWS: { size: Size; label: string; hint: string }[] = [
  { size: 'big', label: 'Big', hint: 'the one that decides the day' },
  { size: 'medium', label: 'Medium', hint: 'real work, not all day' },
  { size: 'small', label: 'Small', hint: 'clears in one sitting' },
];

export function ShapeBar({ verdict }: { verdict: ShapeVerdict }) {
  const { shape, target, over, note } = verdict;

  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Shape</p>
        <p className="font-mono text-xs text-muted">
          {shape.big}·{shape.medium}·{shape.small} against {target.big}·{target.medium}·
          {target.small}
        </p>
      </div>

      <div className="mt-3 space-y-2.5">
        {ROWS.map(({ size, label, hint }) => {
          const count = shape[size];
          const want = target[size];
          const excess = over[size];
          const tone: Tone = excess > 0 ? 'warn' : count > 0 ? 'pass' : 'neutral';

          return (
            <div key={size} className="flex items-center gap-3" title={`${label} — ${hint}`}>
              <span className="w-14 shrink-0 text-xs font-medium text-text">{label}</span>

              {/* One pip per commitment. Pips past the shape are amber, and say so. */}
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {Array.from({ length: Math.max(want, count) }, (_, index) => {
                  const filled = index < count;
                  const beyond = index >= want;
                  return (
                    <span
                      key={index}
                      className={`h-2.5 w-6 rounded-full ${
                        filled
                          ? beyond
                            ? 'bg-warn/70'
                            : 'bg-signal'
                          : 'border border-dashed border-edge'
                      }`}
                    />
                  );
                })}
              </span>

              <span
                className={`w-16 shrink-0 text-right font-mono text-xs ${
                  tone === 'warn' ? 'text-warn' : tone === 'pass' ? 'text-deep' : 'text-muted'
                }`}
              >
                {count} of {want}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        Set B, M or S on each line. The minutes only pick a starting guess.
      </p>

      {note ? (
        <p
          className={`mt-3 flex items-start gap-2 border-t border-edge pt-3 text-xs ${
            verdict.matches ? 'text-soft' : 'text-warn'
          }`}
        >
          <Icon
            name={verdict.matches ? 'sparkle' : 'alert'}
            size={13}
            className="mt-px shrink-0"
          />
          <span>{note}</span>
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-2 border-t border-edge pt-3 text-xs text-deep">
          <Icon name="check" size={13} />
          The shape holds.
        </p>
      )}
    </div>
  );
}
