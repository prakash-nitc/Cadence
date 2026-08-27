import { useState } from 'react';
import type { BlockDef } from '../config/schedule.config';
import { carve } from '../engine/carve';
import { formatDuration } from '../lib/time';
import { BlockBuilder } from './BlockBuilder';

/**
 * The two ways out of the standard weekday — SPEC §2.6.
 *
 * Build custom: start blank or from the picked template, then add, remove, reorder and
 * resize. Quick carve: "I have N hours today", filled with protected work in priority
 * order, saying what did not fit.
 */
interface CustomDayProps {
  /** The template currently picked, to start a custom build from. */
  seed: BlockDef[];
  availableMinutes: number;
  onUse: (blocks: BlockDef[], label: string) => void;
  onSaveTemplate: (name: string, blocks: BlockDef[]) => void;
  onCancel: () => void;
}

export function CustomDay({
  seed,
  availableMinutes,
  onUse,
  onSaveTemplate,
  onCancel,
}: CustomDayProps) {
  const [mode, setMode] = useState<'build' | 'carve'>('build');
  const [blocks, setBlocks] = useState<BlockDef[]>(seed);
  const [hours, setHours] = useState('4');
  const [name, setName] = useState('');

  const carved = carve(seed, Math.round((Number(hours) || 0) * 60));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg tracking-display text-text">Custom day</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          Back
        </button>
      </div>

      <div className="flex gap-px">
        {(['build', 'carve'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`border px-3 py-1.5 text-xs ${
              mode === option ? 'border-signal text-signal' : 'border-edge text-muted'
            }`}
          >
            {option === 'build' ? 'Build' : 'Quick carve'}
          </button>
        ))}
      </div>

      {mode === 'build' ? (
        <>
          <BlockBuilder
            blocks={blocks}
            onChange={setBlocks}
            availableMinutes={availableMinutes}
          />

          <div className="flex gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Save as — OA day, Interview day"
              aria-label="Template name"
              className="min-w-0 flex-1 border border-edge bg-panel px-2 py-1.5 text-sm text-text focus:border-signal focus:outline-none"
            />
            <button
              type="button"
              disabled={!name.trim() || blocks.length === 0}
              onClick={() => {
                onSaveTemplate(name.trim(), blocks);
                setName('');
              }}
              className="shrink-0 border border-edge px-3 py-1.5 text-sm text-muted hover:border-muted hover:text-text disabled:opacity-40"
            >
              Save
            </button>
          </div>

          <button
            type="button"
            disabled={blocks.length === 0}
            onClick={() => onUse(blocks, 'custom')}
            className="w-full border border-signal bg-signal/10 py-3 font-display text-base tracking-display text-signal hover:bg-signal/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
          >
            Start this day
          </button>
        </>
      ) : (
        <>
          <label className="block">
            <span className="block text-xs uppercase tracking-block text-muted">
              Hours available
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              aria-label="Hours available"
              className="mt-1 w-full border border-edge bg-panel px-3 py-2 font-mono text-lg text-text focus:border-signal focus:outline-none"
            />
          </label>

          <div className="border border-edge bg-panel p-3">
            <p className="text-sm text-text">
              {formatDuration(carved.usedMinutes)} carved.{' '}
              {carved.blocks.length === 0
                ? 'Nothing fits in that.'
                : carved.blocks
                    .map((block) => `${block.label} ${formatDuration(block.minutes)}`)
                    .join(', ') + '.'}
            </p>
            {carved.notFitted.length > 0 ? (
              <p className="mt-1 text-sm text-muted">
                Not fitting: {carved.notFitted.map((block) => block.label).join(', ')}.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={carved.blocks.length === 0}
            onClick={() => onUse(carved.blocks, 'carved')}
            className="w-full border border-signal bg-signal/10 py-3 font-display text-base tracking-display text-signal hover:bg-signal/20 disabled:border-edge disabled:bg-transparent disabled:text-muted"
          >
            Start this day
          </button>
        </>
      )}
    </div>
  );
}
