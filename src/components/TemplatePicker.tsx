import { TEMPLATES } from '../config/schedule.config';
import type { SavedTemplate } from '../db/schema';
import { TEMPLATE_IDS, TEMPLATE_LABELS } from '../lib/templates';
import { formatDuration } from '../lib/time';

/**
 * Template selection — SPEC §2.5, §2.6.
 *
 * Config templates and saved templates appear in the same picker. Only saved ones are
 * editable; the config set is changed by committing, not by clicking.
 */
interface TemplatePickerProps {
  value: string;
  saved: SavedTemplate[];
  onChange: (id: string) => void;
  /** The template the anchor suggests. Marked, never forced. */
  suggested?: string;
}

export function TemplatePicker({ value, saved, onChange, suggested }: TemplatePickerProps) {
  const options = [
    ...TEMPLATE_IDS.map((id) => ({
      id: id as string,
      label: TEMPLATE_LABELS[id],
      minutes: TEMPLATES[id].reduce((sum, block) => sum + block.minutes, 0),
    })),
    ...saved.map((template) => ({
      id: template.id,
      label: template.name,
      minutes: template.blocks.reduce((sum, block) => sum + block.minutes, 0),
    })),
  ];

  return (
    <div className="grid gap-px bg-edge">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex items-baseline justify-between bg-panel px-3 py-3 text-left ${
              selected ? 'text-text' : 'text-muted'
            }`}
          >
            <span className="flex items-baseline gap-2">
              <span
                className={`inline-block h-2 w-2 shrink-0 ${selected ? 'bg-signal' : 'bg-edge'}`}
                aria-hidden
              />
              <span className="text-sm">{option.label}</span>
              {option.id === suggested ? (
                <span className="text-xs text-muted">suggested</span>
              ) : null}
            </span>
            <span className="font-mono text-xs text-muted">{formatDuration(option.minutes)}</span>
          </button>
        );
      })}
    </div>
  );
}
