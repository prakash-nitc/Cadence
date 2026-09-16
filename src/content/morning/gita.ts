/**
 * The Bhagavad Gita, in original English renderings.
 *
 * The Sanskrit is ancient and free; the English most people quote is a modern translation
 * with its own rights. These renderings are written for this app, kept close to the verse,
 * and each cites its chapter and verse so the original can be looked up.
 */
import type { MorningEntry } from './types';

const gita = (
  id: string,
  verse: string,
  text: string,
  themes: MorningEntry['themes'],
): MorningEntry => ({
  id: `gita-${id}`,
  kind: 'quote',
  text,
  by: 'Bhagavad Gita',
  credit: 'rendering',
  source: verse,
  themes,
});

export const GITA: MorningEntry[] = [
  gita('2-47', '2.47', 'Your right is to the work alone, never to its fruits. Do not let the result be your motive, and do not cling to doing nothing.', ['focus', 'start']),
  gita('2-48', '2.48', 'Steady in yourself, do your work and let go of attachment. Evenness in success and failure is what yoga means.', ['comeback', 'consistency']),
  gita('2-50', '2.50', 'Skill in action is yoga. Give yourself to the work and do it well.', ['focus']),
  gita('2-14', '2.14', 'Heat and cold, pleasure and pain come and go. They do not last. Learn to bear them.', ['comeback']),
  gita('2-38', '2.38', 'Treat gain and loss, victory and defeat the same, and then step into the fight.', ['start', 'comeback']),
  gita('2-40', '2.40', 'On this path no effort is wasted and nothing is lost. Even a little of it protects you from great fear.', ['consistency', 'comeback']),
  gita('2-56', '2.56', 'One whose mind is not shaken by sorrow, who does not crave pleasure, and who is free of fear and anger is called steady.', ['comeback']),
  gita('2-70', '2.70', 'As rivers pour into the ocean and it stays still, the one who takes in every desire and stays still finds peace.', ['focus']),
  gita('3-8', '3.8', 'Do the work that is yours to do. Action is better than inaction; without action even the body cannot be kept going.', ['start']),
  gita('3-19', '3.19', 'Without attachment, keep doing the work that has to be done. Working without attachment, a person reaches the highest.', ['consistency', 'focus']),
  gita('3-21', '3.21', 'Whatever the best person does, others follow. The standard they set, the world takes up.', ['consistency']),
  gita('3-35', '3.35', 'Better your own duty done imperfectly than another\'s done well.', ['focus', 'review']),
  gita('6-5', '6.5', 'Lift yourself up by your own self. Do not let yourself sink. You are your own friend, and you are your own enemy.', ['comeback', 'start']),
  gita('6-6', '6.6', 'For one who has mastered the mind, the mind is the best friend. For one who has not, it acts like an enemy.', ['focus']),
  gita('6-16', '6.16', 'This discipline is not for one who eats too much or too little, sleeps too much or too little.', ['review', 'consistency']),
  gita('6-17', '6.17', 'For one who is measured in eating and rest, in effort and in sleep, discipline ends sorrow.', ['review', 'consistency']),
  gita('6-26', '6.26', 'Wherever the restless mind wanders, bring it back, and bring it under the self.', ['focus']),
  gita('6-35', '6.35', 'The mind is restless and hard to hold. But it is held through practice and through letting go.', ['focus', 'consistency']),
  gita('6-40', '6.40', 'One who does good never comes to a bad end.', ['comeback']),
  gita('18-47', '18.47', 'Better your own path walked imperfectly than someone else\'s walked perfectly.', ['review']),
  gita('18-48', '18.48', 'Do not abandon the work that is yours even if it has flaws. Every undertaking is clouded by some fault, as fire is by smoke.', ['start', 'comeback']),
  gita('18-78', '18.78', 'Where there is skill and where there is the one who acts, there is success and steady purpose.', ['start']),
  gita('4-18', '4.18', 'The one who sees inaction in action, and action in inaction, is wise among people.', ['review']),
  gita('5-10', '5.10', 'The one who acts without attachment is untouched by the result, as a lotus leaf is untouched by water.', ['focus', 'comeback']),
];
