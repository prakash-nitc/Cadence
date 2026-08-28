import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  FIXED_WINDOWS,
  FULL_DAY,
  LATE_NIGHT,
  type BlockDef,
} from '../config/schedule.config';
import type { Prefs } from '../lib/prefs';
import { toHHMM } from '../lib/time';
import { anchorMinutes, availableMinutes, degrade, planDay, type Cut } from './capacity';

const prefs: Prefs = DEFAULT_PREFS;
const anchorAt = (hhmm: string, day = '2026-09-01'): Date => new Date(`${day}T${hhmm}:00`);

const run = (template: BlockDef[], hhmm: string, over: Partial<Prefs> = {}) => {
  const anchor = anchorAt(hhmm);
  const merged: Prefs = { ...prefs, ...over };
  return degrade(
    template,
    availableMinutes(anchor, merged.dayEnd),
    merged,
    anchorMinutes(anchor),
  );
};

const kept = (blocks: BlockDef[]): string[] => blocks.map((block) => block.id);
const minutesOf = (blocks: BlockDef[], id: string): number =>
  blocks.find((block) => block.id === id)?.minutes ?? -1;
const droppedIds = (cuts: Cut[]): string[] =>
  cuts.filter((cut) => cut.kind === 'dropped').map((cut) => cut.blockId);
const total = (blocks: BlockDef[]): number =>
  blocks.reduce((sum, block) => sum + block.minutes, 0);

describe('availableMinutes', () => {
  it('measures anchor to soft day end', () => {
    expect(availableMinutes(anchorAt('05:45'), '22:45')).toBe(1020);
    expect(availableMinutes(anchorAt('09:20'), '22:45')).toBe(805);
  });

  it('floors at zero when the anchor is past the day end', () => {
    expect(availableMinutes(anchorAt('23:30'), '22:45')).toBe(0);
  });
});

describe('degrade — normal anchor', () => {
  const result = run(FULL_DAY, '05:45');

  it('cuts nothing when the template fits', () => {
    expect(result.cuts).toHaveLength(0);
    expect(result.blocks).toHaveLength(FULL_DAY.length);
    expect(result.shortfallMinutes).toBe(0);
  });

  it('reports the template and capacity honestly', () => {
    expect(result.templateMinutes).toBe(1020);
    expect(result.availableMinutes).toBe(1020);
  });
});

describe('degrade — late anchor', () => {
  const result = run(FULL_DAY, '09:20');

  it('drops the gym past the cutoff hour', () => {
    expect(droppedIds(result.cuts)).toContain('gym');
    expect(result.cuts.find((cut) => cut.blockId === 'gym')).toMatchObject({
      kind: 'dropped',
      reason: 'gymCutoff',
    });
  });

  it('drops priority 2 blocks and nothing more protected', () => {
    expect(droppedIds(result.cuts).sort()).toEqual(
      ['break_3', 'dsa_second', 'flex', 'gym', 'tea'].sort(),
    );
    expect(result.cuts.some((cut) => cut.kind === 'compressed')).toBe(false);
  });

  it('leaves DSA and Spring Boot at full length', () => {
    expect(minutesOf(result.blocks, 'dsa_deep')).toBe(180);
    expect(minutesOf(result.blocks, 'spring_1')).toBe(100);
    expect(minutesOf(result.blocks, 'spring_2')).toBe(80);
  });

  it('fits the day exactly into capacity', () => {
    expect(total(result.blocks)).toBe(805);
    expect(result.shortfallMinutes).toBe(0);
  });

  it('keeps the surviving blocks in template order', () => {
    expect(kept(result.blocks)).toEqual([
      'wake', 'ready', 'breakfast', 'recall', 'dsa_deep', 'break_1',
      'spring_1', 'lunch', 'spring_2', 'sequential', 'break_2', 'dinner',
      'log', 'winddown',
    ]);
  });
});

describe('degrade — very late anchor forces compression', () => {
  const result = run(FULL_DAY, '14:00');

  it('compresses the protected tier only after everything else is spent', () => {
    // Every priority 2 block dropped, then priority 1 shrunk, then dropped, then DSA cut.
    expect(minutesOf(result.blocks, 'dsa_deep')).toBe(100);
    expect(result.blocks.some((block) => block.id === 'sequential')).toBe(false);
    expect(result.blocks.some((block) => block.id === 'winddown')).toBe(false);
  });

  it('never compresses below the floor', () => {
    expect(minutesOf(result.blocks, 'dsa_deep')).toBeGreaterThanOrEqual(90);
    expect(minutesOf(result.blocks, 'spring_1')).toBeGreaterThanOrEqual(60);
  });

  it('never drops a protected block', () => {
    for (const id of ['recall', 'dsa_deep', 'spring_1', 'spring_2', 'log']) {
      expect(kept(result.blocks)).toContain(id);
    }
  });

  it('never drops a meal', () => {
    for (const id of ['breakfast', 'lunch', 'dinner']) {
      expect(kept(result.blocks)).toContain(id);
    }
  });

  it('fits capacity exactly', () => {
    expect(total(result.blocks)).toBe(525);
    expect(result.shortfallMinutes).toBe(0);
  });

  it('does not report a block as both compressed and dropped', () => {
    for (const cut of result.cuts) {
      if (cut.kind !== 'dropped') continue;
      expect(
        result.cuts.some((other) => other.kind === 'compressed' && other.blockId === cut.blockId),
      ).toBe(false);
    }
  });

  it('reports a dropped block at its current length, not its template length', () => {
    // sequential is compressed 120 -> 60, then dropped: it gives back 60, not 120.
    expect(result.cuts.find((cut) => cut.blockId === 'sequential')).toMatchObject({
      kind: 'dropped',
      minutes: 60,
    });
  });
});

describe('degrade — capacity below the protected floor', () => {
  const result = run(FULL_DAY, '21:00');

  it('reports the shortfall rather than cutting protected work', () => {
    expect(result.shortfallMinutes).toBe(340);
    expect(minutesOf(result.blocks, 'dsa_deep')).toBe(90);
    expect(minutesOf(result.blocks, 'spring_1')).toBe(60);
    expect(minutesOf(result.blocks, 'spring_2')).toBe(60);
    expect(minutesOf(result.blocks, 'log')).toBe(10);
  });

  it('still holds every protected block and every meal', () => {
    expect(kept(result.blocks)).toEqual([
      'wake', 'ready', 'breakfast', 'recall', 'dsa_deep',
      'spring_1', 'lunch', 'spring_2', 'dinner', 'log',
    ]);
  });
});

describe('degrade — gym cutoff', () => {
  it('keeps the gym when the anchor is before the cutoff', () => {
    expect(droppedIds(run(FULL_DAY, '08:59').cuts)).not.toContain('gym');
  });

  it('drops the gym one minute past the cutoff', () => {
    expect(droppedIds(run(FULL_DAY, '09:01').cuts)).toContain('gym');
  });

  it('reads the cutoff from prefs, not from config', () => {
    expect(droppedIds(run(FULL_DAY, '09:01', { gymCutoffHour: 11 }).cuts)).not.toContain('gym');
  });
});

describe('degrade — lateNight template', () => {
  const result = run(LATE_NIGHT, '16:00');

  it('trims the break rather than the work', () => {
    expect(droppedIds(result.cuts)).toEqual(['break_1']);
    expect(minutesOf(result.blocks, 'dsa_deep')).toBe(120);
    expect(minutesOf(result.blocks, 'spring_1')).toBe(120);
  });

  it('fits inside capacity', () => {
    expect(total(result.blocks)).toBeLessThanOrEqual(result.availableMinutes);
    expect(result.shortfallMinutes).toBe(0);
  });
});

describe('degrade — purity', () => {
  it('does not mutate the template', () => {
    const snapshot = JSON.parse(JSON.stringify(FULL_DAY));
    run(FULL_DAY, '14:00');
    expect(FULL_DAY).toEqual(snapshot);
  });

  it('is deterministic', () => {
    expect(run(FULL_DAY, '11:35')).toEqual(run(FULL_DAY, '11:35'));
  });
});

describe('planDay', () => {
  it('degrades then lays out, in that order', () => {
    const { blocks, degradation } = planDay(anchorAt('09:20'), FULL_DAY, FIXED_WINDOWS, prefs);
    expect(degradation.shortfallMinutes).toBe(0);
    expect(blocks.some((block) => block.blockId === 'gym')).toBe(false);
    expect(toHHMM(blocks[0]!.startsAt)).toBe('09:20');
    expect(toHHMM(blocks[blocks.length - 1]!.endsAt)).toBe('22:45');
  });

  it('marks the meals the late start already lost', () => {
    const { blocks } = planDay(anchorAt('09:20'), FULL_DAY, FIXED_WINDOWS, prefs);
    const missed = blocks.filter((block) => block.missedWindow).map((block) => block.blockId);
    expect(missed).toEqual(['breakfast', 'lunch']);
  });
});

describe('availableMinutes — a day end after midnight', () => {
  it('rolls a small-hours day end onto the next day', () => {
    // Someone who works to 01:00 has 3h 16m left at 21:44, not none.
    expect(availableMinutes(anchorAt('21:44'), '01:00')).toBe(196);
    expect(availableMinutes(anchorAt('21:44'), '02:00')).toBe(256);
  });

  it('still measures a normal day end normally', () => {
    expect(availableMinutes(anchorAt('21:44'), '22:45')).toBe(61);
    expect(availableMinutes(anchorAt('05:45'), '22:45')).toBe(1020);
  });

  it('does not roll forward when that would invent an absurd day', () => {
    // Starting at 23:30 against a 22:45 end means the day is over, not 23 hours long.
    expect(availableMinutes(anchorAt('23:30'), '22:45')).toBe(0);
    expect(availableMinutes(anchorAt('21:44'), '21:00')).toBe(0);
  });

  it('is zero exactly at the day end', () => {
    expect(availableMinutes(anchorAt('22:45'), '22:45')).toBe(0);
  });

  it('handles a day end at midnight', () => {
    expect(availableMinutes(anchorAt('21:44'), '00:00')).toBe(136);
  });
});
