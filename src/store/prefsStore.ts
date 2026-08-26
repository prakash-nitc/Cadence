import { create } from 'zustand';
import { loadPrefs, savePref } from '../db/repo';
import type { Prefs } from '../lib/prefs';

interface PrefsState {
  prefs: Prefs | null;
  loaded: boolean;
  load: () => Promise<void>;
  update: <K extends keyof Prefs>(key: K, value: Prefs[K]) => Promise<void>;
}

/**
 * Settings — how the app behaves. Persists across roadmaps.
 *
 * Everything here is read from the database. `DEFAULT_PREFS` seeds it on first run and
 * is never consulted again — see `repo.loadPrefs`.
 */
export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: null,
  loaded: false,

  load: async () => {
    set({ prefs: await loadPrefs(), loaded: true });
  },

  update: async (key, value) => {
    await savePref(key, value);
    const current = get().prefs;
    if (current) set({ prefs: { ...current, [key]: value } });
  },
}));
