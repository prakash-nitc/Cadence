/**
 * The shape of Settings — how the app behaves, as opposed to what the user is working
 * on. Persists across roadmaps.
 *
 * `DEFAULT_PREFS` seeds this on first run and is read at runtime by nothing else.
 * Using it here as a *type* only.
 */
import type { DEFAULT_PREFS } from '../config/schedule.config';

export type Prefs = typeof DEFAULT_PREFS;
export type NotificationKey = keyof Prefs['notifications'];
