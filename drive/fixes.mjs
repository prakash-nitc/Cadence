/**
 * Three reported problems, each fixed:
 *   1. a weekly target that does not matter this week can be paused, and resumed later
 *   2. a block never answered for does not hand over its timer's minutes
 *   3. folding the morning card is remembered, and it can be switched off
 */
import { bodyText, checker, open, seed, shot, tabber } from './lib.mjs';

const { check, step, done } = checker();
const { browser, page, errors } = await open({ clock: '2026-10-02T11:00:00' });
const tab = tabber(page);
const flat = async () => (await bodyText(page)).replace(/\s+/g, ' ');

step('Seed: yesterday had two blocks — one answered for, one never touched');
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00`);
const block = (date, id, label, from, to, over = {}) => ({
  blockId: id, label, detail: null, kind: 'work', priority: 1,
  minutes: (at(date, to) - at(date, from)) / 60_000,
  startsAt: at(date, from), endsAt: at(date, to), status: 'pending', actualEndedAt: null,
  missedWindow: false, straddles: null, window: null, ...over,
});
const ran = (date, from, to) => [{ start: at(date, from), end: at(date, to), seen: at(date, to), endedBy: 'end' }];
const day = (date, blocks) => ({
  date, anchorAt: at(date, '07:00'), template: 'full', blocks, degradation: [], pushes: [],
  interruptions: [], placementMode: false, score: null, band: null, gatePassed: null,
  plannedAt: at(date, '06:00'), plannedBlocks: null, plannedAnchor: null,
});

await seed(page, {
  days: [
    day('2026-10-01', [
      // Worked and answered for: 90 minutes.
      block('2026-10-01', 'dsa_deep', 'DSA deep block', '10:00', '13:00', { status: 'contained', workedMinutes: 90, timer: ran('2026-10-01', '10:00', '13:00') }),
      // Never worked, never ticked — the timer ran only because the app was open.
      block('2026-10-01', 'core_cse', 'Core CSE', '14:00', '16:00', { timer: ran('2026-10-01', '14:00', '16:00') }),
    ]),
    day('2026-10-02', [
      block('2026-10-02', 'dsa_deep', 'DSA deep block', '10:00', '13:00', {
        timer: [{ start: at('2026-10-02', '10:00'), end: null, seen: at('2026-10-02', '11:00') }],
      }),
    ]),
  ],
});

step('2. Yesterday counts only the block that was answered for');
const beat = await page.locator('[data-beat]').innerText();
check('yesterday reads the 90 minutes answered, not the 210 the timers ran', /1h 30m/.test(beat), true);
check("and not the untouched block's two hours", /3h 30m|2h/.test(beat.split('Today')[0] ?? ''), false);
check('today still counts the block running now, live', /1h/.test(beat.split('Today so far')[1] ?? ''), true);
await shot(page, 'fixes-beat');

step('3. Folding the morning card is remembered');
check('the card is open', await page.locator('[data-morning="open"]').count(), 1);
await page.getByRole('button', { name: 'Fold' }).click();
await page.waitForTimeout(600);
check('it folds to one line', await page.locator('[data-morning="folded"]').count(), 1);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
check('and is still folded after a reload', await page.locator('[data-morning="folded"]').count(), 1);
await tab('Day');
await tab('Now');
check('and after leaving the screen', await page.locator('[data-morning="folded"]').count(), 1);
await page.getByRole('button', { name: 'Show', exact: true }).click();
await page.waitForTimeout(600);
check('Show opens it again', await page.locator('[data-morning="open"]').count(), 1);

step('3b. It can be switched off entirely');
await tab('Settings');
const cardGroup = page.getByRole('radiogroup', { name: 'Morning card' });
await cardGroup.getByRole('radio', { name: 'Off' }).click();
await page.waitForTimeout(700);
await tab('Now');
check('no card at all', await page.locator('[data-morning]').count(), 0);
await tab('Settings');
await cardGroup.getByRole('radio', { name: 'Folded to one line' }).click();
await page.waitForTimeout(700);
await tab('Now');
check('folded brings it back as one line', await page.locator('[data-morning="folded"]').count(), 1);

step('1. A target that does not matter this week can be paused');
await tab('Progress');
check('Core CSE hours is on the week', /Core CSE hours/.test(await flat()), true);
await page.getByRole('button', { name: 'Pause Core CSE hours' }).click();
await page.waitForTimeout(800);
const afterPause = await flat();
check('it leaves the targets', /Core CSE hours \d/.test(afterPause), false);
check('and is listed as paused, with a way back', /Paused: .*Core CSE hours — resume/.test(afterPause), true);
await shot(page, 'fixes-paused');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await tab('Progress');
check('it stays paused across a reload', await page.locator('[data-paused-targets]').count(), 1);
await tab('Settings');
check('Settings agrees it is hidden', /Core CSE hours — restore/.test(await flat()), true);

await tab('Progress');
await page.getByRole('button', { name: /Core CSE hours — resume/ }).click();
await page.waitForTimeout(900);
check('resuming brings it back', /Core CSE hours/.test(await flat()), true);
check('and clears the paused strip', await page.locator('[data-paused-targets]').count(), 0);

check('no page errors', errors, []);
await done(browser);
