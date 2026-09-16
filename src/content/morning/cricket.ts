/**
 * Cricket.
 *
 * Few cricket lines have a clean record, so most of this file is original lines in the
 * spirit of the game — the leave outside off stump, the long innings, the fifth day —
 * credited that way and never passed off as something a player said.
 */
import type { MorningEntry } from './types';

const player = (
  id: string,
  by: string,
  text: string,
  themes: MorningEntry['themes'],
): MorningEntry => ({ id: `cricket-${id}`, kind: 'quote', text, by, credit: 'attributed', themes });

const spirit = (id: string, text: string, themes: MorningEntry['themes']): MorningEntry => ({
  id: `cricket-${id}`,
  kind: 'quote',
  text,
  by: null,
  credit: 'spirit',
  source: 'Test cricket',
  themes,
});

export const CRICKET: MorningEntry[] = [
  player('sachin-stones', 'Sachin Tendulkar', 'People throw stones at you, and you convert them into milestones.', ['comeback']),
  player('dhoni-process', 'MS Dhoni', 'The process is more important than the result. Take care of the process and the results will come.', ['focus', 'consistency']),
  player('kohli-belief', 'Virat Kohli', 'Self-belief and hard work will always earn you success.', ['start']),

  spirit('leave', 'Not every delivery deserves your bat. Leave the ones outside off stump, and wait for yours.', ['focus']),
  spirit('session', 'Win the session. Then win the next one. Test matches are won that way, and so are days.', ['focus', 'consistency']),
  spirit('dropped', 'A dropped catch at slip is one ball. The innings is still there to be played.', ['comeback']),
  spirit('fifth-day', 'The fifth-day pitch rewards whoever is still concentrating, not whoever started fastest.', ['consistency']),
  spirit('guard', 'Take guard again after a boundary and after a beaten edge. Every ball starts from zero.', ['comeback', 'focus']),
  spirit('nets', 'Matches are won in the nets, long before anyone is watching.', ['consistency', 'start']),
  spirit('singles', 'Rotate the strike. Singles add up to hundreds.', ['consistency']),
  spirit('new-ball', 'See off the new ball. The first hour is the hardest, and then it gets easier.', ['start']),
  spirit('follow-on', 'Enforcing the follow-on means doing the hard thing again while you still have the advantage.', ['focus']),
  spirit('scoreboard', 'Do not bat for the scoreboard. Bat for the next ball.', ['focus']),
];
