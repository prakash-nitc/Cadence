import { describe, expect, it } from 'vitest';
import { FULL_DAY } from '../config/schedule.config';
import { carve } from './carve';

const ids = (blocks: { id: string }[]): string[] => blocks.map((block) => block.id);
const minutesOf = (blocks: { id: string; minutes: number }[], id: string): number =>
  blocks.find((block) => block.id === id)?.minutes ?? -1;

describe('carve', () => {
  it('takes work blocks only — four hours means four hours at the desk', () => {
    const result = carve(FULL_DAY, 240);
    expect(result.blocks.every((block) => block.kind === 'work')).toBe(true);
    expect(ids(result.blocks)).not.toContain('lunch');
    expect(ids(result.blocks)).not.toContain('gym');
  });

  it('gives every protected block its floor before topping any of them up', () => {
    // Floors at 4h: recall 20 + dsa 90 + spring_1 60 + spring_2 60 + log 10 = 240 exactly.
    const result = carve(FULL_DAY, 240);
    expect(ids(result.blocks)).toEqual(['recall', 'dsa_deep', 'spring_1', 'spring_2', 'log']);
    expect(minutesOf(result.blocks, 'dsa_deep')).toBe(90);
    expect(minutesOf(result.blocks, 'spring_1')).toBe(60);
    expect(result.usedMinutes).toBe(240);
  });

  it('does not let one block swallow the day', () => {
    // A single greedy pass would give dsa_deep its full 180 and push Spring Boot out.
    const result = carve(FULL_DAY, 240);
    expect(ids(result.blocks)).toContain('spring_1');
    expect(ids(result.blocks)).toContain('spring_2');
  });

  it('states what did not fit', () => {
    const result = carve(FULL_DAY, 240);
    expect(ids(result.notFitted)).toEqual(['core_cse', 'flex', 'dsa_second']);
  });

  it('adds the core CSE track once its floor fits', () => {
    // 300 min: protected floors take 240, and the core CSE track's 60 fills the rest.
    const result = carve(FULL_DAY, 300);
    expect(ids(result.blocks)).toEqual([
      'recall', 'dsa_deep', 'spring_1', 'spring_2', 'core_cse', 'log',
    ]);
    expect(result.usedMinutes).toBe(300);
  });

  it('hands the leftover out most protected first', () => {
    // 400 min: floors take 300, and the remaining 100 tops DSA to full, then Spring Boot.
    const result = carve(FULL_DAY, 400);
    expect(minutesOf(result.blocks, 'dsa_deep')).toBe(180);
    expect(minutesOf(result.blocks, 'spring_1')).toBe(70);
    expect(result.usedMinutes).toBe(400);
  });

  it('makes droppable work wait until protected work is at full length', () => {
    // flex has no minMinutes, so its floor is its whole 90. Taking that ahead of topping
    // the DSA block back up would invert the priority order it exists to respect.
    const result = carve(FULL_DAY, 400);
    expect(ids(result.notFitted)).toContain('flex');
    expect(minutesOf(result.blocks, 'dsa_deep')).toBe(180);
  });

  it('never takes a block past its own length', () => {
    const result = carve(FULL_DAY, 650);
    for (const block of result.blocks) {
      const original = FULL_DAY.find((entry) => entry.id === block.id);
      expect(block.minutes).toBeLessThanOrEqual(original?.minutes ?? 0);
    }
  });

  it('fits the whole work day when there is room for it', () => {
    // Every work block at full length: 20+180+100+80+120+90+40+20 = 650.
    const result = carve(FULL_DAY, 650);
    expect(result.usedMinutes).toBe(650);
    expect(result.notFitted).toEqual([]);
  });

  it('does not invent time it was not given', () => {
    const result = carve(FULL_DAY, 800);
    expect(result.usedMinutes).toBe(650);
  });

  it('drops a block whose floor does not fit rather than shaving it', () => {
    // 110 min: recall 20 + dsa floor 90 = 110. Nothing else has room for its floor.
    const result = carve(FULL_DAY, 110);
    expect(ids(result.blocks)).toEqual(['recall', 'dsa_deep']);
    expect(minutesOf(result.blocks, 'dsa_deep')).toBe(90);
  });

  it('carves nothing from no time', () => {
    const result = carve(FULL_DAY, 0);
    expect(result.blocks).toEqual([]);
    expect(result.usedMinutes).toBe(0);
    expect(result.notFitted.length).toBeGreaterThan(0);
  });

  it('treats negative time as none', () => {
    expect(carve(FULL_DAY, -60).availableMinutes).toBe(0);
  });

  it('keeps the surviving blocks in template order', () => {
    const result = carve(FULL_DAY, 400);
    const order = FULL_DAY.map((block) => block.id);
    const positions = ids(result.blocks).map((id) => order.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('does not mutate the template', () => {
    const snapshot = JSON.parse(JSON.stringify(FULL_DAY));
    carve(FULL_DAY, 240);
    expect(FULL_DAY).toEqual(snapshot);
  });
});
