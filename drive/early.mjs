/**
 * Finishing a block early, and answering for a block that was missed.
 *
 * Reported:
 *   1. Finishing early offered "Move them" or "Keep the boundaries". Keeping them did
 *      nothing, and moving them left Now showing nothing running: the finished block still
 *      held its scheduled end, so "now" kept pointing at it.
 *   2. A missed block could only be answered "Stopped on time" or "Ran over", and both then
 *      asked how long you worked. There was no way to say it did not happen.
 *
 * Each scenario gets its own browser: a page clock cannot be wound back between them.
 */
import { bodyText, checker, open, seed, shot, tabber } from './lib.mjs';

const { check, step, done } = checker();
const D = '2026-10-15';
const at = (hhmm) => Date.parse(`${D}T${hhmm}:00`);
const block = (id, label, from, to, kind = 'work') => ({
  blockId: id, label, detail: null, kind, priority: 1, minutes: (at(to) - at(from)) / 60_000,
  startsAt: at(from), endsAt: at(to), status: 'pending', actualEndedAt: null,
  missedWindow: false, straddles: null, window: null,
});
const dayWith = (blocks) => ({
  days: [{
    date: D, anchorAt: at('07:00'), template: 'full', blocks, degradation: [], pushes: [],
    interruptions: [], placementMode: false, score: null, band: null, gatePassed: null,
    plannedAt: at('06:00'), plannedBlocks: null, plannedAnchor: null,
  }],
  commitments: [],
});
const THREE = [
  block('dsa_deep', 'DSA deep block', '10:00', '12:00'),
  block('spring_1', 'Spring Boot', '12:00', '14:00'),
  block('core_cse', 'Core CSE', '14:00', '16:00'),
];

/** A fresh browser at `time` with the day seeded, on Now. */
async function scenario(time, blocks) {
  const opened = await open({ clock: `${D}T09:58:00` });
  await seed(opened.page, dayWith(blocks));
  await opened.page.clock.pauseAt(new Date(`${D}T${time}:00`));
  await opened.page.waitForTimeout(600);
  await tabber(opened.page)('Now');
  return opened;
}

const flat = async (page) => (await bodyText(page)).replace(/\s+/g, ' ');
const storedBlocks = (page) => page.evaluate(async (date) => {
  const db = await new Promise((res) => { const r = indexedDB.open('cadence'); r.onsuccess = () => res(r.result); });
  return new Promise((res) => {
    const q = db.transaction('days').objectStore('days').get(date);
    q.onsuccess = () => res(q.result.blocks.map((b) => ({
      id: b.blockId, status: b.status, worked: b.workedMinutes ?? null,
      from: new Date(b.startsAt).toTimeString().slice(0, 5), to: new Date(b.endsAt).toTimeString().slice(0, 5),
    })));
  });
}, D);
const running = (page) => page.locator('[data-block-timer]').count().then(async (n) =>
  n === 0 ? null : (await page.locator('main h2').first().innerText()).trim());
const allErrors = [];

/** Finish DSA at 11:00, an hour before Spring Boot is due. */
async function finishEarly() {
  const opened = await scenario('11:00', THREE);
  await opened.page.getByRole('button', { name: 'Done — contained' }).click();
  await opened.page.waitForTimeout(400);
  await opened.page.getByRole('button', { name: /^Log / }).click();
  await opened.page.waitForTimeout(1000);
  return opened;
}

{
  step('Finish early, then start the next block now and keep the schedule');
  const { browser, page, errors } = await finishEarly();
  check('an hour is free before Spring Boot', /1h free until Spring Boot/.test(await flat(page)), true);
  await page.getByRole('button', { name: 'Start next block early' }).click();
  await page.waitForTimeout(400);
  check('it says what starting now does', /Spring Boot starts now and runs to 14:00 as planned — 1h longer\. Nothing else moves\./.test(await flat(page)), true);
  await shot(page, 'early-choice');
  await page.getByRole('button', { name: 'Start it now' }).click();
  await page.waitForTimeout(1200);
  check('Spring Boot is the block running now', await running(page), 'Spring Boot');
  check('it runs 11:00–14:00, taking the freed hour', /11:00–14:00/.test(await flat(page)), true);
  const blocks = await storedBlocks(page);
  check('DSA ends when it was finished', blocks.find((b) => b.id === 'dsa_deep')?.to, '11:00');
  check('Core CSE keeps its boundary', blocks.find((b) => b.id === 'core_cse'), { id: 'core_cse', status: 'pending', worked: null, from: '14:00', to: '16:00' });
  await page.clock.runFor(5 * 60_000);
  check('and Spring Boot is being timed', await page.locator('[data-block-timer]').getAttribute('data-block-timer'), 'running');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('all of it survives a reload', await running(page), 'Spring Boot');
  await shot(page, 'early-started');
  allErrors.push(...errors);
  await browser.close();
}

{
  step('Finish early, then move every boundary earlier');
  const { browser, page, errors } = await finishEarly();
  await page.getByRole('button', { name: 'Start next block early' }).click();
  await page.waitForTimeout(400);
  check('it says everything moves', /Every block after this moves 1h earlier\./.test(await flat(page)), true);
  await page.getByRole('button', { name: 'Move everything earlier' }).click();
  await page.waitForTimeout(1200);
  check('Spring Boot is the block running now', await running(page), 'Spring Boot');
  check('it runs 11:00–13:00, keeping its length', /11:00–13:00/.test(await flat(page)), true);
  const blocks = await storedBlocks(page);
  check('Core CSE moved an hour earlier too', blocks.find((b) => b.id === 'core_cse')?.from, '13:00');
  allErrors.push(...errors);
  await browser.close();
}

{
  step('Finish early and choose neither: the free hour stays free');
  const { browser, page, errors } = await finishEarly();
  await page.getByRole('button', { name: 'Start next block early' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Not yet' }).click();
  await page.waitForTimeout(600);
  check('back to the free time, nothing moved', /1h free until Spring Boot/.test(await flat(page)), true);
  const blocks = await storedBlocks(page);
  check('Spring Boot still starts at 12:00', blocks.find((b) => b.id === 'spring_1')?.from, '12:00');
  allErrors.push(...errors);
  await browser.close();
}

{
  step('A block that was missed entirely');
  const { browser, page, errors } = await scenario('12:30', THREE);
  const prompt = await flat(page);
  check('it asks about the missed block', /How did DSA deep block go\?/.test(prompt), true);
  check('and says what each answer means', /Did it, kept going past the end/.test(prompt) && /Missed or skipped/.test(prompt), true);
  await shot(page, 'early-missed-prompt');
  await page.getByRole('button', { name: /Didn.t do it/ }).click();
  await page.waitForTimeout(1000);
  check('no time question follows', /How long did you work/.test(await flat(page)), false);
  const blocks = await storedBlocks(page);
  check('the block is recorded as skipped, with no time', blocks.find((b) => b.id === 'dsa_deep'), { id: 'dsa_deep', status: 'skipped', worked: null, from: '10:00', to: '12:00' });
  check('and Spring Boot is running', await running(page), 'Spring Boot');
  // Spring Boot's timer has only just started, so a missed DSA adding nothing means 0m.
  check('the missed block adds no time worked', (await page.locator('[data-beat-today]').innerText()).trim(), '0m');
  allErrors.push(...errors);
  await browser.close();
}

{
  step('Ran over still asks for the time — and it can still be corrected');
  const { browser, page, errors } = await scenario('12:30', THREE);
  await page.getByRole('button', { name: /Ran over/ }).click();
  await page.waitForTimeout(400);
  check('it asks how long', /How long did you work on DSA deep block\?/.test(await flat(page)), true);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  check('Cancel goes back to the three answers', /Didn.t do it/.test(await flat(page)), true);
  allErrors.push(...errors);
  await browser.close();
}

check('no page errors in any scenario', allErrors, []);
console.log(`\n${allErrors.length === 0 ? '' : 'errors: ' + allErrors.join(' | ')}`);
// checker() exits through done(); give it a browser-shaped object to close.
await done({ close: async () => {} });
