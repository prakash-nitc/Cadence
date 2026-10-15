/**
 * Plan templates — SPEC §3.4.
 *
 * Reported: every plan had to be typed in, because templates only set the blocks and Plan
 * had no way to add a commitment at all. Over two evenings: add on Plan, copy a day's plan,
 * save a template, and open the next night already planned.
 */
import { bodyText, checker, open, seed, shot, storedCommitments, tabber } from './lib.mjs';

const { check, step, done } = checker();
const { browser, page, errors } = await open({ clock: '2026-10-15T21:00:00' });
const tab = tabber(page);
const flat = async () => (await bodyText(page)).replace(/\s+/g, ' ');
const list = () => page.locator('[data-plan-list]');
const listNames = async () => ((await list().count()) ? (await list().innerText()) : '');
const ticked = async () => page.locator('[data-plan-list] [role="checkbox"][aria-checked="true"]').count();

const W = '2026-10-15';
const weekday = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
const COPY = `Copy ${weekday(W)}'s plan`;
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00`);
const c = (id, date, blockId, label, targetType, target, planned, status = 'open', routine = false) => ({
  id, dayDate: date, blockId, label, targetType, target, done: 0, plannedMinutes: planned, tags: [],
  status, displacedBy: null, movedCount: 0, originDate: date, routine,
});

step(`${weekday(W)} 21:00: the day was planned by hand, as usual`);
await seed(page, {
  days: [{
    date: W, anchorAt: at(W, '07:00'), template: 'full', blocks: [], degradation: [], pushes: [],
    interruptions: [], placementMode: false, score: null, band: null, gatePassed: null,
    plannedAt: at(W, '06:00'), plannedBlocks: null, plannedAnchor: null,
  }],
  commitments: [
    c('w1', W, 'dsa_deep', 'DSA Revision', 'count', 10, 180),
    c('w2', W, 'core_cse', 'SQL practice', 'binary', 1, 120),
    c('w3', W, 'spring_1', 'Projects', 'minutes', 90, 90),
    // A one-off left from Tuesday, waiting in the box.
    c('t1', '2026-10-14', 'flex', 'HashMap + String', 'binary', 1, 90),
  ],
});
await tab('Plan');

step('Add a commitment on Plan itself');
await page.getByRole('button', { name: 'Add a commitment' }).click();
// The block arranger on this page has its own Block field and Add button: stay in the form.
const adder = page.locator('[data-add-to-plan]');
await adder.getByLabel('New commitment').fill('ML basics — linear regression');
await adder.getByLabel('Block').selectOption({ label: 'Flex' });
await adder.getByRole('radio', { name: 'Minutes' }).click();
await adder.getByLabel('Minutes for it').fill('60');
await adder.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(500);
check('it is in tomorrow, ticked', /ML basics — linear regression/.test(await listNames()), true);

step('Dropping a leftover does not throw the added row away');
await page.getByRole('button', { name: 'Drop HashMap + String' }).click();
await page.waitForTimeout(800);
check('the added row survives the list being recomposed', /ML basics — linear regression/.test(await listNames()), true);
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(800);

step(COPY);
await page.getByRole('button', { name: COPY }).click();
await page.waitForTimeout(600);
const copied = await listNames();
for (const name of ['DSA Revision', 'SQL practice', 'Projects']) {
  check(`${name} is copied in`, copied.includes(name), true);
}
// Copied rows are recurring work: the unfinished leftovers they match are covered, not continued.
for (const name of ['DSA Revision', 'SQL practice', 'Projects']) {
  check(`${name} leaves the leftovers box`, await page.locator(`[data-leftover="${name}"]`).count(), 0);
  check(`${name} is in as recurring work`, await page.locator(`[data-plan-row="${name}"]`).getAttribute('data-source'), 'template');
}
const before = await ticked();
await page.getByRole('button', { name: COPY }).click();
await page.waitForTimeout(500);
check('copying twice adds nothing twice', await ticked(), before);

step('Adding a leftover by name uses the leftover, not a second row');
await adder.getByLabel('New commitment').fill('hashmap + string');
await adder.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(600);
check('the leftover leaves its box', await page.locator('[data-leftover="HashMap + String"]').count(), 0);
check('and is in tomorrow once', ((await listNames()).match(/hashmap \+ string/gi) ?? []).length, 1);
await adder.getByRole('button', { name: 'Done', exact: true }).click();

step('Save the plan as a template');
const plannedCount = await ticked();
console.log(`    ${plannedCount} ticked for tomorrow`);
await page.getByRole('button', { name: 'Save as a template' }).click();
await page.getByLabel('Template name').fill('Placement weekday');
await page.getByRole('button', { name: 'Save template' }).click();
await page.waitForTimeout(1200);
check('it says where to find it', /Saved “Placement weekday”\. Pick it under Start from\./.test(await flat()), true);
check('and tomorrow now starts from it', /Placement weekday/.test(await flat()), true);
check('with the same commitments still ticked', await ticked(), plannedCount);
await shot(page, 'templates-saved');

step('Save tomorrow');
await page.getByRole('button', { name: /^Save plan/ }).click();
await page.waitForTimeout(1500);
const thursday = (await storedCommitments(page)).filter((row) => row.dayDate === '2026-10-16');
console.log('    saved: ' + thursday.map((row) => `${row.label} (${row.routine ? 'recurring' : 'one-off'})`).join(', '));
check('every ticked row was saved', thursday.length, plannedCount);
// Everything ticked went into the template — including the leftover continued by hand —
// so all of it is recurring now: the template brings it back, nothing piles up as leftovers.
check('every row from the template is recurring', thursday.every((row) => row.routine === true), true);

step('The next night: the plan arrives already filled in');
await page.clock.fastForward('25:00:00'); // the next day, 22:00
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await tab('Plan');
const thursdayNight = await flat();
check('it opens on the remembered template', /Placement weekday/.test(thursdayNight), true);
const tonight = await listNames();
for (const name of ['DSA Revision', 'SQL practice', 'Projects', 'ML basics — linear regression']) {
  check(`${name} is already in`, tonight.includes(name), true);
}
check('ticked, with no typing', (await ticked()) >= 4, true);
// The covered leftovers were retired with the save: no duplicates waiting in the box.
for (const name of ['DSA Revision', 'SQL practice', 'Projects']) {
  check(`${name} is not waiting as a leftover too`, await page.locator(`[data-leftover="${name}"]`).count(), 0);
}
await shot(page, 'templates-next-night');

step('Settings shows what the template holds');
await tab('Settings');
check('blocks and commitments', /Placement weekday[\s\S]{0,40}blocks · \d+ commitments/.test(await flat()), true);

check('no page errors', errors, []);
await done(browser);
