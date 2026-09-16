/**
 * Athletes and coaches.
 *
 * Sports quotes are some of the most misattributed lines there are. Anything without a
 * clear record is marked `attributed`, and the card says so rather than presenting it as
 * certainly theirs.
 */
import type { MorningEntry } from './types';

const athlete = (
  id: string,
  by: string,
  text: string,
  themes: MorningEntry['themes'],
  credit: MorningEntry['credit'] = 'attributed',
  source?: string,
): MorningEntry => ({
  id: `athlete-${id}`,
  kind: 'quote',
  text,
  by,
  credit,
  ...(source ? { source } : {}),
  themes,
});

export const ATHLETES: MorningEntry[] = [
  athlete('gretzky-shots', 'Wayne Gretzky', 'You miss 100% of the shots you don\'t take.', ['start']),
  athlete('jordan-failed', 'Michael Jordan', 'I\'ve failed over and over and over again in my life. And that is why I succeed.', ['comeback'], 'said', 'Nike advert, 1997'),
  athlete('kobe-rest', 'Kobe Bryant', 'Rest at the end, not in the middle.', ['focus', 'consistency']),
  athlete('ali-suffer', 'Muhammad Ali', 'Don\'t quit. Suffer now and live the rest of your life as a champion.', ['comeback', 'consistency']),
  athlete('serena-recover', 'Serena Williams', 'A champion is defined not by their wins but by how they can recover when they fall.', ['comeback']),
  athlete('kipchoge-free', 'Eliud Kipchoge', 'Only the disciplined ones in life are free. If you are undisciplined, you are a slave to your moods.', ['consistency', 'start']),
  athlete('federer-work', 'Roger Federer', 'There is no way around hard work. Embrace it.', ['start', 'focus']),
  athlete('bolt-nine', 'Usain Bolt', 'I trained four years to run nine seconds.', ['consistency']),
  athlete('hamm-watching', 'Mia Hamm', 'A champion is someone who is bent over, drenched in sweat, at the point of exhaustion, when no one else is watching.', ['consistency', 'focus']),
  athlete('prefontaine-gift', 'Steve Prefontaine', 'To give anything less than your best is to sacrifice the gift.', ['focus']),
  athlete('king-right', 'Billie Jean King', 'Champions keep playing until they get it right.', ['comeback', 'consistency']),
  athlete('owens-dreams', 'Jesse Owens', 'To make dreams come into reality, it takes determination, dedication, self-discipline and effort.', ['start']),
  athlete('tyson-plan', 'Mike Tyson', 'Everybody has a plan until they get punched in the mouth.', ['comeback', 'review']),
  athlete('wooden-can', 'John Wooden', 'Don\'t let what you cannot do interfere with what you can do.', ['comeback', 'focus']),
  athlete('wooden-hurry', 'John Wooden', 'Be quick, but don\'t hurry.', ['focus']),
  athlete('lee-kick', 'Bruce Lee', 'I fear not the man who has practised 10,000 kicks once, but the man who has practised one kick 10,000 times.', ['consistency']),
  athlete('notke-talent', 'Tim Notke', 'Hard work beats talent when talent doesn\'t work hard.', ['start', 'consistency']),
  athlete('kobe-rise', 'Kobe Bryant', 'Everything negative — pressure, challenges — is an opportunity for me to rise.', ['comeback']),
  athlete('phelps-limit', 'Michael Phelps', 'You can\'t put a limit on anything. The more you dream, the farther you get.', ['start']),
  athlete('bradley-persist', 'Bill Bradley', 'Ambition is the path to success. Persistence is the vehicle you arrive in.', ['consistency']),
];
