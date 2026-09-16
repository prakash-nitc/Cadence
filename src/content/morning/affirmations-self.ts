/**
 * Affirmations about the person doing the work: getting back up, keeping going, staying
 * steady. First person, present tense, no promises the day cannot keep.
 */
import type { MorningEntry } from './types';

const say = (id: string, text: string, themes: MorningEntry['themes']): MorningEntry => ({
  id: `affirm-${id}`,
  kind: 'affirmation',
  text,
  by: null,
  themes,
});

export const AFFIRMATIONS_SELF: MorningEntry[] = [
  say('yesterday', 'Yesterday is scored and done. Today starts clean.', ['comeback']),
  say('back-up', 'A bad day does not make a bad week. I get back to the plan today.', ['comeback']),
  say('show-up', 'I show up on the days I don\'t feel like it. Those are the days that count most.', ['consistency', 'comeback']),
  say('streak', 'I protect what I have built. One more good day.', ['consistency']),
  say('compare', 'I compare myself with who I was last month, not with anyone else.', ['review', 'comeback']),
  say('patient', 'Results take time. I keep doing the work while they catch up.', ['consistency']),
  say('control', 'I control my effort and my attention. The rest I let go.', ['focus', 'comeback']),
  say('body', 'I sleep, I eat, I move. My mind works better when I look after my body.', ['review', 'consistency']),
  say('honest', 'I track my day honestly, because an honest number is one I can improve.', ['review']),
  say('enough', 'I don\'t need a perfect day. I need an honest, full one.', ['start', 'comeback']),
  say('discomfort', 'Discomfort means I am learning. I stay with it.', ['focus', 'comeback']),
  say('week', 'This week I look at what worked, keep it, and fix one thing.', ['review']),
  say('future', 'The person I want to be next year is built by what I do today.', ['start', 'consistency']),
  say('proud', 'Tonight I want to be proud of how I spent today.', ['start', 'review']),
  say('calm', 'I stay calm under pressure. Pressure is part of the game.', ['focus', 'comeback']),
  say('small-wins', 'Small wins every day add up to a big result.', ['consistency']),
  say('distraction', 'I notice when my mind wanders, and I bring it back without fuss.', ['focus']),
  say('reset', 'If the morning goes wrong, I reset at the next block, not tomorrow.', ['comeback']),
];
