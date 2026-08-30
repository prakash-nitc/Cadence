import { useState } from 'react';
import type { MilestoneStatus, MilestoneView } from '../engine/pacing';
import { Icon } from './ui/Icon';
import { Bar, Button, type Tone } from './ui/primitives';

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
  done: 'text-deep',
  missed: 'text-fail',
};

const BAR_TONE: Record<MilestoneStatus, Tone> = {
  upcoming: 'signal',
  atRisk: 'warn',
  done: 'pass',
  missed: 'fail',
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

  /*
   * How far in it is, from the checklist the roadmap gave it. A milestone with no
   * checklist has no measurable progress, so it draws no bar rather than an empty one
   * implying nothing has been done.
   */
  const total = milestone.checklist.length;
  const done = milestone.checked.filter((item) => milestone.checklist.includes(item)).length;
  const fraction = status === 'done' ? 1 : total === 0 ? null : done / total;

  return (
    <div className="border-b border-edge px-4 py-3 transition-colors last:border-b-0 hover:bg-sunk/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="w-20 shrink-0 pt-0.5 font-mono text-xs text-muted">
          {milestone.date}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm font-medium ${
              status === 'done' ? 'text-muted line-through' : 'text-text'
            }`}
          >
            {milestone.critical ? <span className="mr-1 text-signal">•</span> : null}
            {milestone.label}
          </span>

          {fraction === null ? null : (
            <span className="mt-2 block max-w-md">
              <Bar value={fraction} tone={BAR_TONE[status]} height="h-1.5" animate={false} />
              <span className="mt-1 block font-mono text-xs text-muted">
                {status === 'done' && total === 0
                  ? 'marked done'
                  : `${done} of ${total} done`}
              </span>
            </span>
          )}
        </span>

        <span className="shrink-0 text-right">
          <span
            className={`flex items-center justify-end gap-1.5 text-xs font-medium ${STATUS_TONE[status]}`}
          >
            {status === 'done' ? <Icon name="check" size={13} /> : null}
            {status === 'missed' || status === 'atRisk' ? <Icon name="alert" size={13} /> : null}
            {STATUS_LABEL[status]}
          </span>
          {remaining ? (
            <span className="mt-0.5 block font-mono text-xs text-muted">{remaining}</span>
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
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                          checked ? 'border-signal bg-signal text-panel' : 'border-edge'
                        }`}
                      >
                        {checked ? <Icon name="check" size={11} /> : null}
                      </span>
                      <span
                        className={`text-xs ${checked ? 'text-muted line-through' : 'text-text'}`}
                      >
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

          <Button size="sm" variant="ghost" className="mt-3" onClick={onToggleDone}>
            {status === 'done' ? 'Mark not done' : 'Mark done'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
