import { useState } from 'react';
import type { MilestoneStatus, MilestoneView } from '../engine/pacing';

/**
 * One milestone — SPEC §4.4. Date, days remaining, derived status, and its sub-checklist.
 */
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  upcoming: 'Upcoming',
  atRisk: 'At risk',
  done: 'Done',
  missed: 'Missed',
};

const STATUS_TONE: Record<MilestoneStatus, string> = {
  upcoming: 'text-muted',
  atRisk: 'text-warn',
  done: 'text-pass',
  missed: 'text-fail',
};

interface MilestoneRowProps {
  milestone: MilestoneView;
  onToggleItem: (item: string) => void;
  onToggleDone: () => void;
}

export function MilestoneRow({ milestone, onToggleItem, onToggleDone }: MilestoneRowProps) {
  const [open, setOpen] = useState(false);
  const { status, daysRemaining } = milestone;

  const remaining =
    status === 'done'
      ? ''
      : daysRemaining < 0
        ? `${Math.abs(daysRemaining)}d ago`
        : daysRemaining === 0
          ? 'today'
          : `${daysRemaining}d`;

  return (
    <div className="border-b border-edge px-3 py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="w-20 shrink-0 font-mono text-xs text-muted">{milestone.date}</span>

        <span className="min-w-0 flex-1">
          <span className={`block text-sm ${status === 'done' ? 'text-muted' : 'text-text'}`}>
            {milestone.critical ? <span className="mr-1 text-signal">•</span> : null}
            {milestone.label}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className={`block text-xs ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
          {remaining ? (
            <span className="block font-mono text-xs text-muted">{remaining}</span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div className="mt-2 pl-20">
          {milestone.checklist.length > 0 ? (
            <ul className="space-y-1">
              {milestone.checklist.map((item) => {
                const checked = milestone.checked.includes(item);
                return (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => onToggleItem(item)}
                      className="flex items-center gap-2 text-left"
                    >
                      <span
                        className={`h-3 w-3 shrink-0 border ${
                          checked ? 'border-pass bg-pass' : 'border-edge'
                        }`}
                      />
                      <span className={`text-xs ${checked ? 'text-muted' : 'text-text'}`}>
                        {item}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted">
              No sub-checklist in the roadmap for this one.
            </p>
          )}

          <button
            type="button"
            onClick={onToggleDone}
            className="mt-2 border border-edge px-2 py-1 text-xs text-muted hover:border-muted hover:text-text"
          >
            {status === 'done' ? 'Mark not done' : 'Mark done'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
