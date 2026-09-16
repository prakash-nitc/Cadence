/**
 * Football.
 *
 * A handful of attributed lines from players and managers, and original lines in the
 * spirit of the game, credited as such.
 */
import type { MorningEntry } from './types';

const person = (
  id: string,
  by: string,
  text: string,
  themes: MorningEntry['themes'],
): MorningEntry => ({ id: `football-${id}`, kind: 'quote', text, by, credit: 'attributed', themes });

const spirit = (id: string, text: string, themes: MorningEntry['themes']): MorningEntry => ({
  id: `football-${id}`,
  kind: 'quote',
  text,
  by: null,
  credit: 'spirit',
  source: 'football',
  themes,
});

export const FOOTBALL: MorningEntry[] = [
  person('pele-accident', 'Pelé', 'Success is no accident. It is hard work, perseverance, learning, studying, sacrifice, and love of what you are doing.', ['start', 'consistency']),
  person('ronaldo-talent', 'Cristiano Ronaldo', 'Talent without working hard is nothing.', ['start']),
  person('messi-overnight', 'Lionel Messi', 'It took me seventeen years and 114 days to become an overnight success.', ['consistency']),
  person('cruyff-simple', 'Johan Cruyff', 'Playing football is very simple, but playing simple football is the hardest thing there is.', ['focus']),
  person('klopp-leave', 'Jürgen Klopp', 'It is not so important what people think when you come in. It is much more important what they think when you leave.', ['review']),

  spirit('ninety', 'A match is ninety minutes. Nobody wins it in the first ten, and plenty lose it in the last five.', ['focus', 'consistency']),
  spirit('first-touch', 'Your first touch decides what the next three can be. Start the day clean.', ['start']),
  spirit('conceded', 'Conceding early is not the result. Kick off again.', ['comeback']),
  spirit('off-ball', 'Most of the game is played off the ball. So is most of a good day.', ['consistency']),
  spirit('clean-sheet', 'A clean sheet is ninety minutes of concentration, not one great save.', ['focus']),
  spirit('pressing', 'Press as a habit, not as a mood. The team that keeps doing it wins the ball back.', ['consistency']),
  spirit('training-ground', 'The goal on Saturday was scored on the training ground on Tuesday.', ['consistency', 'start']),
];
