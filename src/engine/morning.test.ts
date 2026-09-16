import { describe, expect, it } from 'vitest';
import { MORNING_LIBRARY, type MorningEntry } from '../content/morning';
import type { CommitmentRecord } from '../db/schema';
import type { ScheduledBlock } from './layout';
import {
  creditLine,
  firstThing,
  pickCard,
  pickEntry,
  themeFor,
  type DayContext,
  type ShownCard,
} from './morning';

const context = (over: Partial<DayContext> = {}): DayContext => ({
  // A Wednesday, so neither Monday nor Sunday picks the theme.
  date: '2026-09-16',
  yesterdayBand: null,
  greenRun: 0,
  hasBig: false,
  ...over,
});

const entry = (id: string, over: Partial<MorningEntry> = {}): MorningEntry => ({
  id,
  kind: 'quote',
  text: id,
  by: null,
  themes: [],
  ...over,
});

const addDays = (date: string, days: number): string => {
  const at = new Date(`${date}T12:00:00`);
  at.setDate(at.getDate() + days);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};

/** Run the picker day after day, feeding each card back in as history, like the store does. */
const runDays = (
  entries: MorningEntry[],
  from: string,
  days: number,
  favourites: ReadonlySet<string> = new Set(),
): ShownCard[] => {
  const history: ShownCard[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    history.push(pickCard(entries, context({ date: addDays(from, offset) }), history, favourites));
  }
  return history;
};

describe('morning — the library', () => {
  it('has unique ids, so favourites and history never point at the wrong line', () => {
    const ids = MORNING_LIBRARY.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never presents an original line as someone else\'s words', () => {
    for (const item of MORNING_LIBRARY.filter((line) => line.credit === 'spirit')) {
      expect(item.by).toBeNull();
      expect(item.source).toBeTruthy();
    }
  });

  it('cites a verse for every Gita rendering', () => {
    for (const item of MORNING_LIBRARY.filter((line) => line.credit === 'rendering')) {
      expect(item.source).toMatch(/^\d+\.\d+$/);
    }
  });

  it('has both quotes and affirmations', () => {
    expect(MORNING_LIBRARY.some((item) => item.kind === 'quote')).toBe(true);
    expect(MORNING_LIBRARY.some((item) => item.kind === 'affirmation')).toBe(true);
  });
});

describe('morning — the kind of day', () => {
  it('reads a red yesterday as a comeback, even on a Monday', () => {
    expect(themeFor(context({ date: '2026-09-14', yesterdayBand: 'red' }))).toBe('comeback');
  });

  it('starts the week on Monday and reviews it on Sunday', () => {
    expect(themeFor(context({ date: '2026-09-14' }))).toBe('start');
    expect(themeFor(context({ date: '2026-09-20' }))).toBe('review');
  });

  it('notices a run of green days, then a Big piece of work', () => {
    expect(themeFor(context({ greenRun: 3 }))).toBe('consistency');
    expect(themeFor(context({ hasBig: true }))).toBe('focus');
    expect(themeFor(context())).toBeNull();
  });
});

describe('morning — picking', () => {
  it('gives the same card for the same day', () => {
    const a = pickCard(MORNING_LIBRARY, context(), [], new Set());
    const b = pickCard(MORNING_LIBRARY, context(), [], new Set());
    expect(a).toEqual(b);
  });

  it('gives a different card the next day', () => {
    const [first, second] = runDays(MORNING_LIBRARY, '2026-09-16', 2);
    expect(first?.quoteId).not.toBe(second?.quoteId);
    expect(first?.affirmationId).not.toBe(second?.affirmationId);
  });

  it('shows every entry once before any repeats', () => {
    const pool = Array.from({ length: 10 }, (_, index) => entry(`q${index}`));
    const cards = runDays(pool, '2026-03-01', 10);
    expect(new Set(cards.map((card) => card.quoteId)).size).toBe(10);
  });

  it('keeps going round once the pool is used up', () => {
    const pool = Array.from({ length: 4 }, (_, index) => entry(`q${index}`));
    const cards = runDays(pool, '2026-03-01', 9);
    expect(cards.every((card) => card.quoteId !== null)).toBe(true);
  });

  it('prefers an entry that suits the day', () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, index) => entry(`plain${index}`)),
      entry('comeback', { themes: ['comeback'] }),
    ];
    const picked = pickEntry(pool, 'quote', '2026-09-16', 'comeback', [], new Set());
    expect(picked?.id).toBe('comeback');
  });

  it('does not give up the no-repeat rule for a theme', () => {
    const pool = [entry('a', { themes: ['comeback'] }), entry('b'), entry('c')];
    const history: ShownCard[] = [{ date: '2026-09-15', quoteId: 'a', affirmationId: null }];
    const picked = pickEntry(pool, 'quote', '2026-09-16', 'comeback', history, new Set());
    expect(picked?.id).not.toBe('a');
  });

  it('brings favourites back more often than the rest', () => {
    const pool = Array.from({ length: 60 }, (_, index) => entry(`q${index}`));
    const cards = runDays(pool, '2026-01-01', 60, new Set(['q7']));
    const shown = cards.filter((card) => card.quoteId === 'q7').length;
    // Without the star it would come up once in sixty days.
    expect(shown).toBeGreaterThanOrEqual(5);
  });

  it('never shows the same favourite two days running', () => {
    const pool = Array.from({ length: 30 }, (_, index) => entry(`q${index}`));
    const cards = runDays(pool, '2026-01-01', 60, new Set(['q3']));
    for (let index = 1; index < cards.length; index += 1) {
      if (cards[index]?.quoteId === 'q3') expect(cards[index - 1]?.quoteId).not.toBe('q3');
    }
  });

  it('includes the user\'s own entries in the rotation', () => {
    const own = entry('own-1', { kind: 'affirmation', text: 'I finish what I start.' });
    const pool = [own, entry('lib-1', { kind: 'affirmation' })];
    const cards = runDays(pool, '2026-09-16', 2);
    expect(cards.map((card) => card.affirmationId)).toContain('own-1');
  });

  it('picks nothing of a kind the pool does not have', () => {
    expect(pickEntry([entry('q')], 'affirmation', '2026-09-16', null, [], new Set())).toBeNull();
  });
});

describe('morning — credit', () => {
  it('says what kind of credit a line has', () => {
    expect(creditLine(entry('x', { credit: 'spirit', source: 'Haikyuu!!' }))).toBe('in the spirit of Haikyuu!!');
    expect(creditLine(entry('x', { credit: 'attributed', by: 'Kobe Bryant' }))).toBe('attributed to Kobe Bryant');
    expect(creditLine(entry('x', { credit: 'rendering', by: 'Bhagavad Gita', source: '2.47' }))).toBe('Bhagavad Gita 2.47');
    expect(creditLine(entry('x', { credit: 'said', by: 'Rocky Balboa', source: 'Rocky Balboa (2006)' }))).toBe('Rocky Balboa, Rocky Balboa (2006)');
    expect(creditLine(entry('x', { by: 'Someone' }))).toBe('Someone');
    expect(creditLine(entry('x'))).toBeNull();
  });
});

describe('morning — the first thing', () => {
  const thresholds = { bigMinutes: 120, mediumMinutes: 60 };
  const block = (blockId: string, hhmm: string): ScheduledBlock => ({
    blockId,
    label: blockId,
    detail: null,
    kind: 'work',
    priority: 1,
    minutes: 60,
    startsAt: Date.parse(`2026-09-16T${hhmm}:00`),
    endsAt: Date.parse(`2026-09-16T${hhmm}:00`) + 3_600_000,
    status: 'pending',
    actualEndedAt: null,
    missedWindow: false,
    straddles: null,
    window: null,
  });
  const commitment = (over: Partial<CommitmentRecord>): CommitmentRecord => ({
    id: 'c',
    dayDate: '2026-09-16',
    blockId: null,
    label: 'x',
    targetType: 'count',
    target: 1,
    done: 0,
    plannedMinutes: 30,
    tags: [],
    status: 'open',
    displacedBy: null,
    movedCount: 0,
    originDate: '2026-09-16',
    ...over,
  });

  it('names the first Big piece of work in the order the day runs', () => {
    const blocks = [block('late', '15:00'), block('early', '09:00')];
    const first = firstThing(
      [
        commitment({ id: 'a', label: 'Small early', blockId: 'early', plannedMinutes: 30 }),
        commitment({ id: 'b', label: 'Big late', blockId: 'late', plannedMinutes: 180 }),
      ],
      blocks,
      thresholds,
    );
    expect(first).toEqual({ label: 'Big late', size: 'big', minutes: 180 });
  });

  it('falls back to the first unfinished thing when nothing is Big', () => {
    const blocks = [block('late', '15:00'), block('early', '09:00')];
    const first = firstThing(
      [
        commitment({ id: 'a', label: 'Later', blockId: 'late' }),
        commitment({ id: 'b', label: 'Sooner', blockId: 'early' }),
      ],
      blocks,
      thresholds,
    );
    expect(first?.label).toBe('Sooner');
  });

  it('skips work already finished or dropped', () => {
    const first = firstThing(
      [
        commitment({ id: 'a', label: 'Done', plannedMinutes: 180, done: 1, status: 'complete' }),
        commitment({ id: 'b', label: 'Dropped', plannedMinutes: 180, status: 'skipped' }),
        commitment({ id: 'c', label: 'Open', plannedMinutes: 30 }),
      ],
      [],
      thresholds,
    );
    expect(first?.label).toBe('Open');
  });

  it('says nothing when there is nothing to do', () => {
    expect(firstThing([], [], thresholds)).toBeNull();
  });
});
