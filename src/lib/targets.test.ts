import { describe, expect, it } from 'vitest';
import { WEEKLY_TARGETS } from '../config/schedule.config';
import type { TargetOverride } from '../db/schema';
import { blankOverride, customTarget, resolveTargets } from './targets';

const find = <T extends { id: string }>(targets: T[], id: string): T | undefined =>
  targets.find((entry) => entry.id === id);

describe('resolveTargets', () => {
  it('returns the roadmap unchanged when nothing is overridden', () => {
    expect(resolveTargets([])).toEqual(WEEKLY_TARGETS);
  });

  it('renames without touching anything else', () => {
    const targets = resolveTargets([
      { ...blankOverride('core_cse', 5), label: 'Core CSE subjects' },
    ]);
    const target = find(targets, 'core_cse');
    expect(target?.label).toBe('Core CSE subjects');
    expect(target?.min).toBe(8);
    expect(target?.source).toEqual({ kind: 'minutesTag', tag: 'core_cse' });
  });

  it('changes the numbers', () => {
    const targets = resolveTargets([
      { ...blankOverride('spring_hours', 3), min: 20, warnBelow: 16 },
    ]);
    expect(find(targets, 'spring_hours')).toMatchObject({ min: 20, warnBelow: 16 });
  });

  it('leaves untouched fields following config, so a roadmap swap still moves them', () => {
    const targets = resolveTargets([{ ...blankOverride('dsa_new', 0), min: 25 }]);
    const target = find(targets, 'dsa_new');
    expect(target?.min).toBe(25);
    // max, unit, note and source all still come from the roadmap.
    expect(target?.max).toBe(20);
    expect(target?.unit).toBe('problems');
  });

  it('hides a target without deleting the roadmap entry', () => {
    const targets = resolveTargets([{ ...blankOverride('gym', 6), hidden: true }]);
    expect(find(targets, 'gym')).toBeUndefined();
    expect(WEEKLY_TARGETS.some((target) => target.id === 'gym')).toBe(true);
  });

  it('restores a hidden target when the flag is cleared', () => {
    expect(find(resolveTargets([{ ...blankOverride('gym', 6), hidden: false }]), 'gym')).toBeDefined();
  });

  it('adds a target of the user\'s own', () => {
    const added = customTarget('Semiconductor prep', 'hours', 6, 'coa', 'minutesTag', 99);
    const targets = resolveTargets([added]);
    const target = find(targets, added.id);

    expect(target).toMatchObject({ label: 'Semiconductor prep', min: 6, unit: 'hours' });
    expect(target?.source).toEqual({ kind: 'minutesTag', tag: 'coa' });
  });

  it('puts added targets after the roadmap ones', () => {
    const added = customTarget('Extra', 'hours', 1, 'extra', 'minutesTag', 99);
    const targets = resolveTargets([added]);
    expect(targets[targets.length - 1]?.id).toBe(added.id);
  });

  it('keeps the roadmap order otherwise', () => {
    const targets = resolveTargets([{ ...blankOverride('sleep', 7), min: 6 }]);
    expect(targets.map((target) => target.id)).toEqual(WEEKLY_TARGETS.map((target) => target.id));
  });

  it('ignores an override for a target that no longer exists in config', () => {
    const orphan: TargetOverride = { ...blankOverride('gone_from_roadmap', 9), label: 'Old' };
    expect(resolveTargets([orphan]).some((target) => target.id === 'gone_from_roadmap')).toBe(false);
  });

  it('does not mutate the config array', () => {
    const snapshot = JSON.parse(JSON.stringify(WEEKLY_TARGETS));
    resolveTargets([{ ...blankOverride('dsa_new', 0), label: 'Changed', min: 99 }]);
    expect(WEEKLY_TARGETS).toEqual(snapshot);
  });
});

describe('customTarget', () => {
  it('builds each counting kind', () => {
    expect(customTarget('a', 'problems', 5, 'x', 'countTag', 0).custom?.source)
      .toEqual({ kind: 'countTag', tag: 'x' });
    expect(customTarget('a', 'hours', 5, 'x', 'minutesTag', 0).custom?.source)
      .toEqual({ kind: 'minutesTag', tag: 'x' });
    expect(customTarget('a', 'days', 5, 'x', 'daysTag', 0).custom?.source)
      .toEqual({ kind: 'daysTag', tag: 'x' });
  });

  it('gives each one a distinct id', () => {
    const a = customTarget('a', 'hours', 1, 'x', 'minutesTag', 0);
    const b = customTarget('a', 'hours', 1, 'x', 'minutesTag', 0);
    expect(a.id).not.toBe(b.id);
  });
});
