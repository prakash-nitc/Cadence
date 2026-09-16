/**
 * Affirmations about the work itself: starting, focusing, deep blocks.
 *
 * First person, present tense, concrete. Written for this life — DSA, Spring Boot, core
 * CSE, placements — rather than generic lines that could be about anyone.
 */
import type { MorningEntry } from './types';

const say = (id: string, text: string, themes: MorningEntry['themes']): MorningEntry => ({
  id: `affirm-${id}`,
  kind: 'affirmation',
  text,
  by: null,
  themes,
});

export const AFFIRMATIONS_WORK: MorningEntry[] = [
  say('hard-first', 'I start the hard block before I touch my phone.', ['start', 'focus']),
  say('one-thing', 'I do one thing at a time, and I finish it.', ['focus']),
  say('first-minute', 'I don\'t wait to feel ready. I start, and the feeling follows.', ['start']),
  say('stuck-problem', 'When a problem stops me, I stay with it for ten more minutes before I look anything up.', ['focus']),
  say('boundary', 'When the block ends, I stop. Tomorrow\'s block is already waiting.', ['focus', 'consistency']),
  say('deep-work', 'My best hours go to my hardest work.', ['focus', 'start']),
  say('closed-tabs', 'I close what I don\'t need. The screen holds only today\'s task.', ['focus']),
  say('write-it', 'I write the solution from memory before I call it learned.', ['focus']),
  say('explain-it', 'I can explain what I studied today out loud, in plain words.', ['review', 'focus']),
  say('build', 'I build something real every day, even if it is small.', ['consistency', 'start']),
  say('pattern', 'Every problem I solve makes the next one easier to see.', ['consistency']),
  say('interview', 'I prepare today for the interview I haven\'t been called to yet.', ['start', 'consistency']),
  say('commit', 'I commit my code in small pieces, and I keep moving.', ['consistency']),
  say('slow-is-fine', 'Slow and correct beats fast and wrong. I take the time to understand.', ['focus']),
  say('plan-trust', 'Last night I decided what today is for. This morning I just follow it.', ['start']),
  say('big-first', 'I finish my big task before the day gets noisy.', ['focus', 'start']),
  say('attention', 'My attention is the most valuable thing I spend today.', ['focus']),
  say('no-zero', 'Today will not be a zero day. Even one solved problem counts.', ['comeback', 'start']),
];
