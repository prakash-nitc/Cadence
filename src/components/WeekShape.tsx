import type { Shape } from '../engine/pacing';

/**
 * Week shape — SPEC §4.3. "4 green · 2 yellow · 1 red — target met."
 *
 * The metric that matters more than any single day. The three-yellow warning is printed
 * as a sentence rather than left for the reader to notice in the counts.
 */
export function WeekShape({ shape, label }: { shape: Shape; label: string }) {
  const cells: { band: 'green' | 'yellow' | 'red'; count: number; tone: string }[] = [
    { band: 'green', count: shape.green, tone: 'bg-pass' },
    { band: 'yellow', count: shape.yellow, tone: 'bg-warn' },
    { band: 'red', count: shape.red, tone: 'bg-fail' },
  ];

  const total = shape.green + shape.yellow + shape.red + shape.unscored;

  return (
    <section className="border border-edge bg-panel p-3">
      <p className="text-xs uppercase tracking-block text-muted">{label}</p>

      <p className="mt-1.5 font-mono text-sm">
        {cells.map((cell, index) => (
          <span key={cell.band}>
            {index > 0 ? <span className="text-muted"> · </span> : null}
            <span
              className={
                cell.band === 'green'
                  ? 'text-pass'
                  : cell.band === 'yellow'
                    ? 'text-warn'
                    : 'text-fail'
              }
            >
              {cell.count} {cell.band}
            </span>
          </span>
        ))}
        {shape.unscored > 0 ? (
          <span className="text-muted"> · {shape.unscored} displaced</span>
        ) : null}
        <span className="text-muted"> — {shape.targetMet ? 'target met' : 'target missed'}</span>
      </p>

      {total > 0 ? (
        <div className="mt-2 flex h-1.5 w-full gap-px">
          {cells.map((cell) =>
            cell.count === 0 ? null : (
              <div
                key={cell.band}
                className={cell.tone}
                style={{ width: `${(cell.count / total) * 100}%` }}
              />
            ),
          )}
          {shape.unscored > 0 ? (
            <div
              className="border border-edge"
              style={{ width: `${(shape.unscored / total) * 100}%` }}
            />
          ) : null}
        </div>
      ) : null}

      {shape.warning ? <p className="mt-2 text-xs text-fail">{shape.warning}</p> : null}
    </section>
  );
}
