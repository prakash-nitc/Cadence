/**
 * A short set of general lines on work and habit, to sit between the sports ones.
 */
import type { MorningEntry } from './types';

const quote = (
  id: string,
  by: string,
  text: string,
  themes: MorningEntry['themes'],
  credit: MorningEntry['credit'] = 'attributed',
  source?: string,
): MorningEntry => ({
  id: `discipline-${id}`,
  kind: 'quote',
  text,
  by,
  credit,
  ...(source ? { source } : {}),
  themes,
});

export const DISCIPLINE: MorningEntry[] = [
  quote('durant-habit', 'Will Durant', 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', ['consistency'], 'said', 'The Story of Philosophy, summarising Aristotle'),
  quote('twain-started', 'Mark Twain', 'The secret of getting ahead is getting started.', ['start']),
  quote('seneca-luck', 'Seneca', 'Luck is what happens when preparation meets opportunity.', ['consistency']),
  quote('aurelius-be', 'Marcus Aurelius', 'Waste no more time arguing about what a good man should be. Be one.', ['start'], 'said', 'Meditations 10.16'),
  quote('epictetus-demand', 'Epictetus', 'How long are you going to wait before you demand the best for yourself?', ['start']),
  quote('rohn-discipline', 'Jim Rohn', 'Discipline is the bridge between goals and accomplishment.', ['consistency']),
  quote('franklin-prepare', 'Benjamin Franklin', 'By failing to prepare, you are preparing to fail.', ['review']),
  quote('confucius-stop', 'Confucius', 'It does not matter how slowly you go as long as you do not stop.', ['consistency', 'comeback']),
];
