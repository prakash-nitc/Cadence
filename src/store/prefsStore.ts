import { create } from 'zustand';
import type { WeeklyTarget } from '../config/schedule.config';
import {
  deleteTargetOverride,
  listTargetOverrides,
  loadPrefs,
  putTargetOverrides,
  savePref,
} from '../db/repo';
import type { TargetOverride } from '../db/schema';
import type { Prefs } from '../lib/prefs';
import { resolveTargets } from '../lib/targets';

interface PrefsState {
  prefs: Prefs | null;
  loaded: boolean;
  /** Raw overrides, for the editor. */
  overrides: TargetOverride[];
  /** Config plus overrides — what every screen should read. */
  targets: WeeklyTarget[];
  load: () => Promise<void>;
  update: <K extends keyof Prefs>(key: K, value: Prefs[K]) => Promise<void>;
  saveTargets: (overrides: TargetOverride[]) => Promise<void>;
  removeTarget: (id: string) => Promise<void>;
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
  overrides: [],
  targets: resolveTargets([]),

  load: async () => {
    const [prefs, overrides] = await Promise.all([loadPrefs(), listTargetOverrides()]);
    set({ prefs, overrides, targets: resolveTargets(overrides), loaded: true });
  },

  saveTargets: async (overrides) => {
    await putTargetOverrides(overrides);
    const stored = await listTargetOverrides();
    set({ overrides: stored, targets: resolveTargets(stored) });
  },

  removeTarget: async (id) => {
    await deleteTargetOverride(id);
    const stored = await listTargetOverrides();
    set({ overrides: stored, targets: resolveTargets(stored) });
  },

  update: async (key, value) => {
    await savePref(key, value);
    const current = get().prefs;
    if (current) set({ prefs: { ...current, [key]: value } });
  },
}));
