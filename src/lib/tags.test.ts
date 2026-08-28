import { describe, expect, it } from 'vitest';
import { countsToward, defaultTagsForBlock, defaultTargetTypeForBlock, knownTags } from './tags';

describe('countsToward', () => {
  it('names the target a tag feeds', () => {
    expect(countsToward(['dsa_new'], 'count')).toEqual(['New DSA problems']);
    expect(countsToward(['dsa_resolve'], 'count')).toEqual(['Cold re-solves']);
    expect(countsToward(['spring'], 'minutes')).toEqual(['Spring Boot hours']);
    expect(countsToward(['core_cse'], 'minutes')).toEqual(['Core CSE hours']);
  });

  it('respects the target type, which is the easy thing to get wrong', () => {
    // Tagged spring but counted in problems: Spring Boot hours measures minutes, so this
    // counts toward nothing at all. Saying so is the entire point.
    expect(countsToward(['spring'], 'count')).toEqual([]);
    expect(countsToward(['dsa_new'], 'minutes')).toEqual([]);
  });

  it('counts a days-based target whatever the type', () => {
    expect(countsToward(['recall'], 'binary')).toEqual(['Recall drills']);
    expect(countsToward(['recall'], 'count')).toEqual(['Recall drills']);
  });

  it('reports every target a set of tags feeds', () => {
    expect(countsToward(['dsa_new', 'recall'], 'count').sort()).toEqual(
      ['New DSA problems', 'Recall drills'].sort(),
    );
  });

  it('says nothing for a tag no target measures', () => {
    expect(countsToward(['flex'], 'minutes')).toEqual([]);
    expect(countsToward(['whatever-i-typed'], 'count')).toEqual([]);
    expect(countsToward([], 'count')).toEqual([]);
  });

  it('never claims a target measured from blocks or logs', () => {
    // Gym is counted from a contained block and sleep from the log, never from a tag.
    expect(countsToward(['gym'], 'binary')).toEqual([]);
    expect(countsToward(['sleep'], 'count')).toEqual([]);
  });
});

describe('knownTags', () => {
  const tags = knownTags();
  const find = (tag: string) => tags.find((entry) => entry.tag === tag);

  it('offers every tag a weekly target measures', () => {
    for (const tag of ['dsa_new', 'dsa_resolve', 'spring', 'core_cse', 'recall']) {
      expect(find(tag)).toBeDefined();
    }
  });

  it('offers the tags the presets use, even uncounted ones', () => {
    expect(find('dsa')).toBeDefined();
    expect(find('flex')).toBeDefined();
    expect(find('log')).toBeDefined();
  });

  it('says which targets each one feeds', () => {
    expect(find('dsa_new')?.targets).toEqual(['New DSA problems']);
    expect(find('flex')?.targets).toEqual([]);
  });

  it('lists each tag once', () => {
    expect(new Set(tags.map((entry) => entry.tag)).size).toBe(tags.length);
  });
});

describe('defaults from the block', () => {
  it('gives a DSA commitment its DSA tags without being asked', () => {
    expect(defaultTagsForBlock('dsa_deep')).toEqual(['dsa', 'dsa_new']);
    expect(defaultTagsForBlock('dsa_second')).toEqual(['dsa', 'dsa_resolve']);
    expect(defaultTagsForBlock('spring_1')).toEqual(['spring']);
    expect(defaultTagsForBlock('recall')).toEqual(['recall']);
  });

  it('and the target type the block expects', () => {
    expect(defaultTargetTypeForBlock('dsa_deep')).toBe('count');
    expect(defaultTargetTypeForBlock('spring_1')).toBe('minutes');
    expect(defaultTargetTypeForBlock('recall')).toBe('binary');
  });

  it('leaves a block with no preset alone', () => {
    expect(defaultTagsForBlock('break_1')).toEqual([]);
    expect(defaultTagsForBlock(null)).toEqual([]);
    expect(defaultTargetTypeForBlock('break_1')).toBeNull();
  });

  it('does not hand out a shared array', () => {
    const first = defaultTagsForBlock('dsa_deep');
    first.push('mutated');
    expect(defaultTagsForBlock('dsa_deep')).toEqual(['dsa', 'dsa_new']);
  });
});
