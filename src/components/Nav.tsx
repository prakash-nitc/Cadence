/**
 * Five-tab nav — SPEC §8. Bottom bar on mobile; a persistent left rail above 1024px.
 * No icons where a word will do.
 */
export const TABS = ['Now', 'Day', 'Plan', 'Progress', 'Settings'] as const;
export type Tab = (typeof TABS)[number];

interface NavProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

export function Nav({ tab, onChange }: NavProps) {
  return (
    <>
      {/* Mobile: bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-edge bg-panel lg:hidden">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === tab ? 'page' : undefined}
            className={`py-3 text-xs ${item === tab ? 'text-signal' : 'text-muted'}`}
          >
            {item}
          </button>
        ))}
      </nav>

      {/* Desktop: left rail */}
      <nav className="hidden w-44 shrink-0 flex-col gap-px border-r border-edge bg-ink lg:flex">
        <div className="px-4 py-5">
          <span className="font-display text-lg tracking-display text-text">Cadence</span>
        </div>
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === tab ? 'page' : undefined}
            className={`border-l-2 px-4 py-2.5 text-left text-sm ${
              item === tab ? 'border-signal text-text' : 'border-transparent text-muted'
            }`}
          >
            {item}
          </button>
        ))}
      </nav>
    </>
  );
}
