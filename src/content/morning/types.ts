/**
 * The morning card's library — SPEC §3.6.
 *
 * Content, not roadmap and not behaviour: it outlives any phase of work and is not a
 * setting. The user's own entries live in the database and join this at runtime.
 */

/**
 * What kind of day an entry suits. The card prefers an entry whose theme matches the day,
 * and falls back to any entry rather than repeating one.
 */
export type Theme = 'start' | 'focus' | 'comeback' | 'consistency' | 'review';

export interface MorningEntry {
  /** Stable forever: favourites and the record of what was shown refer to it. */
  id: string;
  kind: 'quote' | 'affirmation';
  text: string;
  /** Who said it. Null for affirmations and for lines whose author cannot be named. */
  by: string | null;
  /**
   * How far the attribution can be trusted.
   *
   * `said` is a documented quote. `attributed` is widely credited to that person without
   * a primary source, and the card says "attributed to". `spirit` is an original line
   * written in the spirit of a work, never presented as a quote from it. `rendering` is an
   * original English rendering of a classical text, with the verse cited.
   */
  credit?: 'said' | 'attributed' | 'spirit' | 'rendering';
  /** Where the line comes from, beyond the person: a verse number, a film, a series. */
  source?: string;
  themes: Theme[];
}
