/**
 * What the records already say — SPEC §4.5.
 *
 * Every line here is arithmetic over rows the app stored. Nothing is predicted and
 * nothing is inferred: each claim carries the number of days behind it so a thin one can
 * be discounted, and when nothing clears its threshold the panel says how far off it is
 * rather than inventing something to fill the space.
 *
 * Each claim also shows the comparison it came from. A sentence on its own has to be
 * believed; the bars under it can be watched, and next week they are a little different.
 */
import type { Insight } from '../../engine/insights';
import { EvidenceBars } from '../charts/Charts';
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
            : 'Nothing has enough behind it yet. The comparisons need a few more answered blocks before they mean anything.'}
        </p>
      ) : (
        <ul className="divide-y divide-edge">
          {found.map((insight, index) => (
            <li key={insight.key} className={`flex gap-3 pb-5 ${index === 0 ? '' : 'pt-5'}`}>
              <span className="mt-0.5 shrink-0 text-signal">
                <Icon name="chart" size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{insight.headline}</p>
                <p className="mt-0.5 text-sm text-soft">{insight.detail}</p>

                <div className="mt-3">
                  <EvidenceBars bars={insight.bars} unit={insight.unit} max={insight.max} />
                </div>

                <p className="mt-2.5 font-mono text-xs text-muted">
                  from {insight.sample} {insight.sample === 1 ? 'record' : 'records'}
                  {insight.bars.some((bar) => bar.thin)
                    ? ' · the faint bars are still gathering'
                    : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
