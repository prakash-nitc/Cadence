/**
 * Sports films and sports anime.
 *
 * Dialogue from films and series is someone's script, so only a couple of short, widely
 * quoted lines appear as quotes. Everything else is an original line written in the spirit
 * of the work and credited that way — the card reads "in the spirit of Haikyuu!!", never
 * as though a character said it.
 */
import type { MorningEntry } from './types';

const line = (
  id: string,
  by: string,
  source: string,
  text: string,
  themes: MorningEntry['themes'],
): MorningEntry => ({ id: `screen-${id}`, kind: 'quote', text, by, credit: 'said', source, themes });

const spirit = (
  id: string,
  source: string,
  text: string,
  themes: MorningEntry['themes'],
): MorningEntry => ({ id: `screen-${id}`, kind: 'quote', text, by: null, credit: 'spirit', source, themes });

export const SCREEN: MorningEntry[] = [
  line('rocky-hit', 'Rocky Balboa', 'Rocky Balboa (2006)', 'It ain\'t about how hard you hit. It\'s about how hard you can get hit and keep moving forward.', ['comeback']),
  line('fightclub-minute', 'Tyler Durden', 'Fight Club (1999)', 'This is your life, and it\'s ending one minute at a time.', ['start', 'focus']),
  line('fightclub-lost', 'Tyler Durden', 'Fight Club (1999)', 'It\'s only after we\'ve lost everything that we\'re free to do anything.', ['comeback']),

  // Rocky
  spirit('rocky-steps', 'Rocky', 'Run the steps before the city is awake. Nobody sees that part, and it is the part that wins.', ['start', 'consistency']),
  spirit('rocky-round', 'Rocky', 'Go one more round than you thought you had in you. That round is where it changes.', ['comeback', 'focus']),
  spirit('rocky-distance', 'Rocky', 'The goal was never to knock him out. It was to still be standing at the final bell.', ['consistency', 'comeback']),
  spirit('rocky-meat', 'Rocky', 'Train with what you have. The fancy gym is not what makes a fighter.', ['start']),

  // Fight Club
  spirit('fightclub-comfort', 'Fight Club', 'The things you own and the scroll you cannot stop end up owning you. Close the tab.', ['focus']),
  spirit('fightclub-hurt', 'Fight Club', 'You learn more from the hard session than from ten comfortable ones.', ['comeback']),

  // Haikyuu!!
  spirit('haikyuu-floor', 'Haikyuu!!', 'The ball has not touched the floor yet. While it is in the air, the point is still yours.', ['comeback', 'focus']),
  spirit('haikyuu-higher', 'Haikyuu!!', 'Short is not a reason to stop jumping. It is a reason to jump higher and faster.', ['comeback', 'start']),
  spirit('haikyuu-connect', 'Haikyuu!!', 'Receive, set, spike. Every hard thing today is three simple touches done well.', ['focus']),
  spirit('haikyuu-view', 'Haikyuu!!', 'The view from the top of the net is only for the ones who kept practising the jump.', ['consistency']),
  spirit('haikyuu-rival', 'Haikyuu!!', 'A rival who beat you is the best coach you will ever get for free.', ['comeback', 'review']),
  spirit('haikyuu-next', 'Haikyuu!!', 'Lose the set, bow, and walk back on court. There is another set to play.', ['comeback']),

  // Blue Lock
  spirit('bluelock-ego', 'Blue Lock', 'Want it more than everyone else on the pitch. Hunger is a skill you can train.', ['start', 'focus']),
  spirit('bluelock-devour', 'Blue Lock', 'Take what the strongest player does, learn it, and make it yours by tonight.', ['focus', 'review']),
  spirit('bluelock-weapon', 'Blue Lock', 'Find your one weapon and sharpen it until nobody can stop it.', ['focus', 'consistency']),
  spirit('bluelock-evolve', 'Blue Lock', 'The version of you that lost yesterday is the one you are here to leave behind.', ['comeback']),
  spirit('bluelock-goal', 'Blue Lock', 'A striker is judged by one thing. Decide today what your one thing is.', ['start', 'review']),
];
