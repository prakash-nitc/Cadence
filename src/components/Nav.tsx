/**
 * The sidebar — SPEC §8, §5 of the redesign brief.
 *
 * Desktop only. There is no bottom bar and no mobile breakpoint: the app runs on one
 * Windows laptop, and pretending otherwise cost every screen a set of layout compromises
 * it did not need.
 *
 * The selected row is a soft green ground with a green rail, not a filled green sidebar.
 * Green means "the thing happening now" throughout the app — spending it on chrome would
 * cost it that meaning (§34).
 */
import { Icon, type IconName } from './ui/Icon';

export const TABS = ['Now', 'Day', 'Plan', 'Progress', 'Settings'] as const;
export type Tab = (typeof TABS)[number];

const ICONS: Record<Tab, IconName> = {
  Now: 'now',
  Day: 'day',
  Plan: 'plan',
  Progress: 'progress',
  Settings: 'settings',
};

const HINTS: Record<Tab, string> = {
  Now: 'What you are doing',
  Day: "Today's blocks",
  Plan: 'Log and plan',
  Progress: 'Weeks and months',
  Settings: 'How the app behaves',
};

interface NavProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

export function Nav({ tab, onChange }: NavProps) {
  return (
    <nav
      aria-label="Sections"
      className="flex w-[228px] shrink-0 flex-col border-r border-edge bg-ink"
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-signal text-panel">
          {/* The mark: three rising strokes — a cadence. */}
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 17.5v-4M12 17.5v-8M19 17.5v-12"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="font-display text-[17px] font-semibold tracking-display text-text">
          Cadence
        </span>
      </div>

      <div className="flex flex-col gap-0.5 px-3">
        {TABS.map((item) => {
          const active = item === tab;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              aria-current={active ? 'page' : undefined}
              title={HINTS[item]}
              className={`group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                active
                  ? 'bg-wash font-medium text-deep'
                  : 'text-soft hover:bg-sunk hover:text-text'
              }`}
            >
              {active ? (
                <span
                  className="absolute inset-y-1.5 left-0 w-[3px] rounded-sm bg-signal"
                  aria-hidden="true"
                />
              ) : null}
              <Icon
                name={ICONS[item]}
                size={17}
                className={active ? 'text-signal' : 'text-muted group-hover:text-soft'}
              />
              {item}
            </button>
          );
        })}
      </div>

      <p className="mt-auto px-5 py-5 text-xs leading-relaxed text-muted">
        Plans the night before. Scores what actually happened.
      </p>
    </nav>
  );
}
