import { describe, expect, it } from 'vitest';
import type { TemplateCommitment } from '../db/schema';
import type { PlanItem } from '../store/planStore';
import { mergeIntoPlan, superseded, toTemplateCommitment } from './planRows';

const item = (over: Partial<PlanItem>): PlanItem => ({
  key: 'k',
  source: 'suggestion',
  carriedFrom: null,
  blockId: 'dsa_deep',
  label: 'DSA problems',
  targetType: 'count',
  target: 4,
  plannedMinutes: 120,
  tags: ['dsa'],
  selected: false,
  movedCount: 0,
  detail: null,
  ...over,
});

const row = (over: Partial<TemplateCommitment>): TemplateCommitment => ({
  blockId: 'dsa_deep',
  label: 'Revise DSA',
  targetType: 'count',
  target: 5,
  plannedMinutes: 120,
  tags: [],
  ...over,
});

describe('mergeIntoPlan', () => {
  it('adds rows it has not seen, ticked', () => {
    const merged = mergeIntoPlan([item({ key: 's' })], [row({})], 'template');
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ source: 'template', label: 'Revise DSA', selected: true, target: 5 });
  });

  it('continues a leftover when the same name is typed by hand', () => {
    const leftover = item({ key: 'carry:1', source: 'carry', label: 'SQL practice', blockId: 'flex' });
    const merged = mergeIntoPlan([leftover], [row({ label: '  sql   PRACTICE ', blockId: 'core_cse' })], 'added');
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ key: 'carry:1', selected: true });
  });

  it('lets a template row stand on its own, superseding the leftover', () => {
    // Ticking the leftover would make daily template work a leftover moved every night.
    const leftover = item({ key: 'carry:1', source: 'carry', label: 'SQL practice', blockId: 'flex' });
    const merged = mergeIntoPlan([leftover], [row({ label: 'SQL practice', blockId: 'core_cse' })], 'template');
    expect(merged).toHaveLength(2);
    expect(merged[0]?.selected).toBe(false);
    expect(merged[1]).toMatchObject({ source: 'template', selected: true });
    expect(superseded(merged).map((entry) => entry.key)).toEqual(['carry:1']);
  });

  it('gives a superseded leftover back when its template row is unticked', () => {
    const leftover = item({ key: 'carry:1', source: 'carry', label: 'SQL practice' });
    const merged = mergeIntoPlan([leftover], [row({ label: 'SQL practice' })], 'template');
    const unticked = merged.map((entry) => (entry.source === 'template' ? { ...entry, selected: false } : entry));
    expect(superseded(unticked)).toEqual([]);
  });

  it('ticks a row already in the same slot rather than doubling it', () => {
    const present = item({ key: 's', label: 'Revise DSA', selected: false });
    const merged = mergeIntoPlan([present], [row({})], 'added');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.selected).toBe(true);
  });

  it('keeps the same name in a different slot as different work', () => {
    const present = item({ key: 's', label: 'Revise DSA', blockId: 'flex' });
    expect(mergeIntoPlan([present], [row({})], 'added')).toHaveLength(2);
  });

  it('ignores a row with no name', () => {
    expect(mergeIntoPlan([], [row({ label: '   ' })], 'added')).toEqual([]);
  });

  it('gives every new row its own key', () => {
    const merged = mergeIntoPlan([], [row({ label: 'A' }), row({ label: 'B' })], 'template');
    expect(new Set(merged.map((entry) => entry.key)).size).toBe(2);
  });

  it('gives the same row the same key every time, so edits survive a recompose', () => {
    const first = mergeIntoPlan([], [row({ label: 'Revise DSA' })], 'template');
    const again = mergeIntoPlan([], [row({ label: 'revise dsa' })], 'template');
    expect(first[0]?.key).toBe(again[0]?.key);
  });

  it('carries a chosen size through', () => {
    const merged = mergeIntoPlan([], [row({ size: 'small' })], 'template');
    expect(merged[0]?.size).toBe('small');
  });
});

describe('toTemplateCommitment', () => {
  it('keeps the work and drops the history', () => {
    const kept = toTemplateCommitment(
      item({ key: 'carry:9', source: 'carry', label: ' Projects ', movedCount: 3, selected: true, size: 'big' }),
    );
    expect(kept).toEqual({
      blockId: 'dsa_deep',
      label: 'Projects',
      targetType: 'count',
      target: 4,
      plannedMinutes: 120,
      tags: ['dsa'],
      size: 'big',
    });
  });
});
