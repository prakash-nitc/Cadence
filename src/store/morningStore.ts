/**
 * The morning card's state — SPEC §3.6.
 *
 * The card for a day is picked once and written down. Every later visit reads the record,
 * so the quote does not change when a plan is edited at noon or yesterday's score moves.
 */
import { create } from 'zustand';
import { MORNING_LIBRARY, type MorningEntry } from '../content/morning';
import {
  deleteOwnEntry,
  listFavourites,
  listMorningCards,
  listOwnEntries,
  putMorningCard,
  putOwnEntry,
  setFavourite,
} from '../db/repo';
import { pickCard, type DayContext, type ShownCard } from '../engine/morning';

export interface OwnEntryInput {
  kind: MorningEntry['kind'];
  text: string;
  by: string;
}

interface MorningState {
  loaded: boolean;
  own: MorningEntry[];
  favourites: Set<string>;
  cards: ShownCard[];
  load: () => Promise<void>;
  /** The card for a day: the recorded one, or a fresh pick that is then recorded. */
  cardFor: (context: DayContext) => Promise<ShownCard>;
  addOwn: (input: OwnEntryInput, at: number) => Promise<void>;
  removeOwn: (id: string) => Promise<void>;
  toggleFavourite: (id: string, at: number) => Promise<void>;
}

/** Library and own entries together — what the card draws from. */
export const allEntries = (own: MorningEntry[]): MorningEntry[] => [...MORNING_LIBRARY, ...own];

export const entryById = (own: MorningEntry[], id: string | null): MorningEntry | null =>
  id ? (allEntries(own).find((entry) => entry.id === id) ?? null) : null;

export const useMorning = create<MorningState>((set, get) => ({
  loaded: false,
  own: [],
  favourites: new Set(),
  cards: [],

  load: async () => {
    const [own, favourites, cards] = await Promise.all([
      listOwnEntries(),
      listFavourites(),
      listMorningCards(),
    ]);
    set({
      loaded: true,
      own,
      favourites: new Set(favourites.map((favourite) => favourite.id)),
      cards,
    });
  },

  cardFor: async (context) => {
    if (!get().loaded) await get().load();
    const { own, favourites, cards } = get();

    const recorded = cards.find((card) => card.date === context.date);
    // A recorded card stands unless an entry it names has since been deleted.
    if (
      recorded &&
      (!recorded.quoteId || entryById(own, recorded.quoteId)) &&
      (!recorded.affirmationId || entryById(own, recorded.affirmationId))
    ) {
      return recorded;
    }

    const history = cards.filter((card) => card.date !== context.date);
    const card = pickCard(allEntries(own), context, history, favourites);
    await putMorningCard(card);
    set({ cards: [...history, card] });
    return card;
  },

  addOwn: async (input, at) => {
    const text = input.text.trim();
    if (!text) return;
    const by = input.by.trim();
    const entry = {
      id: `own-${crypto.randomUUID()}`,
      kind: input.kind,
      text,
      by: input.kind === 'quote' && by ? by : null,
      themes: [],
      createdAt: at,
    };
    await putOwnEntry(entry);
    set({ own: [...get().own, entry] });
  },

  removeOwn: async (id) => {
    await deleteOwnEntry(id);
    const favourites = new Set(get().favourites);
    favourites.delete(id);
    set({ own: get().own.filter((entry) => entry.id !== id), favourites });
  },

  toggleFavourite: async (id, at) => {
    const on = !get().favourites.has(id);
    await setFavourite(id, on, at);
    const favourites = new Set(get().favourites);
    if (on) favourites.add(id);
    else favourites.delete(id);
    set({ favourites });
  },
}));
