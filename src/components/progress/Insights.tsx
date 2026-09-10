/**
 * What the records already say — SPEC §4.5.
 *
 * Every line here is arithmetic over rows the app stored. Nothing is predicted and
 * nothing is inferred: each claim carries the number of days behind it so a thin one can
 * be discounted, and when nothing clears its threshold the panel says how far off it is
 * rather than inventing something to fill the space.
 */
import type { Insight } from '../../engine/insights';
import { Icon } from '../ui/Icon';
import { Panel } from '../ui/primitives';

export function Insights({
  found,
  daysToGo,
}: {
  found: Insight[];
  /** Days of records still needed before anything can be said. */
  daysToGo: number;
}) {
  return (
    <Panel title="What your records say" icon="sparkle">
      {found.length === 0 ? (
        <p className="text-sm text-soft">
          {daysToGo > 0
            ? `Not enough logged yet. Around ${daysToGo} more ${daysToGo === 1 ? 'day' : 'days'} and this starts having something to say.`
            : 'Nothing here separates cleanly yet. That is an answer too — no part of the day is letting you down more than another.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {found.map((insight) => (
            <li key={insight.key} className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-signal">
                <Icon name="chart" size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text">{insight.headline}</span>
                <span className="mt-0.5 block text-sm text-soft">{insight.detail}</span>
                <span className="mt-1 block font-mono text-xs text-muted">
                  from {insight.sample} {insight.sample === 1 ? 'record' : 'records'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
