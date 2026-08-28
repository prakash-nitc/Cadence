import { describe, expect, it } from 'vitest';
import { FULL_DAY, SATURDAY } from '../config/schedule.config';
import {
  currentDsaTopic,
  currentSpringPhase,
  currentSubject,
  suggestionsFor,
} from './roadmap';

describe('currentSubject', () => {
  it('finds the subject covering the date', () => {
    expect(currentSubject('2026-08-27')?.id).toBe('sql');
    expect(currentSubject('2026-09-10')?.id).toBe('dbms');
    expect(currentSubject('2026-10-20')?.id).toBe('lld');
  });

  it('resolves a date in a gap forward to the next subject', () => {
    // SQL ends Sat 05 Sep; DBMS starts Tue 08 Sep. Sunday the 6th belongs to what's next.
    expect(currentSubject('2026-09-06')?.id).toBe('dbms');
  });

  it('holds the last subject once the track is over', () => {
    expect(currentSubject('2026-12-01')?.id).toBe('lld');
  });

  it('resolves a date before the track starts to the first subject', () => {
    expect(currentSubject('2026-01-01')?.id).toBe('sql');
  });
});

describe('currentSpringPhase', () => {
  it('finds the phase covering the date', () => {
    expect(currentSpringPhase('2026-08-27')?.label).toBe('Foundations');
    expect(currentSpringPhase('2026-09-15')?.label).toBe('PaperTrail core');
    expect(currentSpringPhase('2026-10-15')?.label).toBe('Defense doc');
  });

  it('holds the last phase once they are done', () => {
    expect(currentSpringPhase('2026-11-20')?.label).toBe('Defense doc');
  });
});

describe('currentDsaTopic', () => {
  // Config targets: trees 18, graphs 14, dp 16.
  it('starts on the first topic with no history', () => {
    expect(currentDsaTopic(0)?.id).toBe('trees');
  });

  it('stays on a topic until its target is met', () => {
    expect(currentDsaTopic(17)?.id).toBe('trees');
  });

  it('moves on once it is', () => {
    expect(currentDsaTopic(18)?.id).toBe('graphs');
    expect(currentDsaTopic(31)?.id).toBe('graphs');
    expect(currentDsaTopic(32)?.id).toBe('dp');
  });

  it('holds the last topic past the end of the track', () => {
    expect(currentDsaTopic(500)?.id).toBe('dp');
  });
});

describe('suggestionsFor', () => {
  const weekdayBlocks = FULL_DAY.map((block) => block.id);

  it('offers only presets whose block exists in the template', () => {
    const saturday = suggestionsFor(
      SATURDAY.map((block) => block.id),
      '2026-09-01',
      0,
    ).map((suggestion) => suggestion.blockId);

    expect(saturday).toContain('mixed_set');
    expect(saturday).toContain('project');
    // The weekday Spring Boot split is not a Saturday shape.
    expect(saturday).not.toContain('spring_1');
    expect(saturday).not.toContain('flex');
  });

  it('returns them in template order', () => {
    const ids = suggestionsFor(weekdayBlocks, '2026-09-01', 0).map((s) => s.blockId);
    expect(ids).toEqual([
      'recall', 'dsa_deep', 'spring_1', 'spring_2', 'core_cse', 'flex', 'dsa_second', 'log',
    ]);
  });

  it('pulls derived labels from the roadmap, not from the preset', () => {
    const september = suggestionsFor(weekdayBlocks, '2026-09-01', 0);
    expect(september.find((s) => s.blockId === 'core_cse')?.label).toBe('SQL');
    expect(september.find((s) => s.blockId === 'spring_1')?.label).toBe('Notes API — solo');
    expect(september.find((s) => s.blockId === 'dsa_deep')?.label).toBe('Trees problems');
  });

  it('follows the roadmap as the date moves', () => {
    const october = suggestionsFor(weekdayBlocks, '2026-10-20', 0);
    expect(october.find((s) => s.blockId === 'core_cse')?.label).toBe('LLD');
    expect(october.find((s) => s.blockId === 'spring_1')?.label).toBe('Defense doc');
  });

  it('follows DSA progress rather than the calendar', () => {
    const ahead = suggestionsFor(weekdayBlocks, '2026-09-01', 20);
    expect(ahead.find((s) => s.blockId === 'dsa_deep')?.label).toBe('Graphs problems');
  });

  it('carries the preset targets and tags through', () => {
    const recall = suggestionsFor(weekdayBlocks, '2026-09-01', 0).find(
      (s) => s.blockId === 'recall',
    );
    expect(recall).toMatchObject({ targetType: 'binary', target: 1, tags: ['recall'] });
  });
});

describe('suggestionsFor — repeated detail', () => {
  it('prints a shared roadmap detail once, not once per block', () => {
    // Spring Boot is split across two blocks and both derive the same phase.
    const withDetail = suggestionsFor(
      FULL_DAY.map((block) => block.id),
      '2026-09-01',
      0,
    ).filter((suggestion) => suggestion.detail !== null);

    expect(new Set(withDetail.map((s) => s.detail)).size).toBe(withDetail.length);
    expect(withDetail.map((s) => s.blockId)).toEqual(['spring_1', 'core_cse']);
  });
});
