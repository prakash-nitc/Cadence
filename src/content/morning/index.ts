/**
 * Everything the morning card draws from, before the user's own entries are added.
 */
import { AFFIRMATIONS_SELF } from './affirmations-self';
import { AFFIRMATIONS_WORK } from './affirmations-work';
import { ATHLETES } from './athletes';
import { CRICKET } from './cricket';
import { DISCIPLINE } from './discipline';
import { FOOTBALL } from './football';
import { GITA } from './gita';
import { SCREEN } from './screen';
import type { MorningEntry } from './types';

export type { MorningEntry, Theme } from './types';

export const MORNING_LIBRARY: MorningEntry[] = [
  ...GITA,
  ...ATHLETES,
  ...CRICKET,
  ...FOOTBALL,
  ...SCREEN,
  ...DISCIPLINE,
  ...AFFIRMATIONS_WORK,
  ...AFFIRMATIONS_SELF,
];
