/**
 * A smoke pass over every screen with a fortnight of real-looking history: nothing throws,
 * nothing renders NaN, and each screen shows what it is for.
 *
 * A floor, not a replacement for the suites that were lost: it checks that the app stands
 * up, not that each rule holds.
 */
import { bodyText, checker, open, seed, shot, tabber } from './lib.mjs';

const { check, step, done } = checker();
const { browser, page, errors } = await open({ clock: '2026-10-02T11:00:00' });
const tab = tabber(page);

step('Seed a fortnight');
const days = [];
const commitments = [];
const logs = [];
for (let index = 0; index < 14; index += 1) {
  const at = new Date('2026-09-19T12:00:00');
  at.setDate(at.getDate() + index);
  const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  const on = (hhmm) => Date.parse(`${date}T${hhmm}:00`);
  const today = date === '2026-10-02';
  const skipped = index % 4 === 0;

  const block = (id, label, hhmm, minutes, status, kind = 'work', worked) => ({
    blockId: id, label, detail: null, kind, priority: 1, minutes,
    startsAt: on(hhmm), endsAt: on(hhmm) + minutes * 60_000, status,
    actualEndedAt: status === 'pending' ? null : on(hhmm) + minutes * 60_000,
    missedWindow: false, straddles: null, window: null,
    ...(worked === undefined ? {} : { workedMinutes: worked }),
  });

  days.push({
    date, anchorAt: on('07:00'), template: 'full',
    blocks: [
      block('breakfast', 'Breakfast', '07:30', 30, 'contained', 'meal'),
      block('dsa_deep', 'DSA deep block', '10:00', 180, today ? 'pending' : 'contained', 'work', today ? undefined : 150),
      block('lunch', 'Lunch', '13:30', 45, 'contained', 'meal'),
      block('core_cse', 'Core CSE', '14:30', 120, today ? 'pending' : skipped ? 'skipped' : 'contained', 'work', today || skipped ? undefined : 110),
    ],
    degradation: [], pushes: [],
    interruptions: index % 3 === 0 ? [{ at: on('11:00'), blockId: 'dsa_deep', reason: 'messages' }] : [],
    placementMode: false, score: null, band: null, gatePassed: null,
    plannedAt: on('06:00'), plannedBlocks: null, plannedAnchor: null,
  });

  commitments.push(
    { id: `dsa-${date}`, dayDate: date, blockId: 'dsa_deep', label: 'DSA Revision', targetType: 'count', target: 4, done: today ? 0 : 2 + (index % 3), plannedMinutes: 180, tags: ['dsa', 'dsa_new'], status: today ? 'open' : 'partial', displacedBy: null, movedCount: 0, originDate: date, routine: true },
    { id: `cse-${date}`, dayDate: date, blockId: 'core_cse', label: 'SQL', targetType: 'minutes', target: 120, done: today ? 0 : 110, plannedMinutes: 120, tags: ['core_cse'], status: today ? 'open' : 'partial', displacedBy: null, movedCount: 0, originDate: date, routine: true },
  );
  if (!today) {
    logs.push({ date, recallDrillDone: index % 2 === 0, sleepHours: 6 + (index % 3), energy: 2 + (index % 4), hardestThing: '', wentWell: 'Deep block held.', wentWrong: 'Lost the afternoon.', toImprove: 'Phone away.', blocksContained: 3, blocksTotal: 4, createdAt: on('22:00') });
  }
}
// One hand-added task left unfinished, so the leftovers box has something in it.
commitments.push({ id: 'cv', dayDate: '2026-09-30', blockId: 'flex', label: 'Rewrite CV', targetType: 'binary', target: 1, done: 0, plannedMinutes: 45, tags: [], status: 'open', displacedBy: null, movedCount: 1, originDate: '2026-09-29', routine: false });

await seed(page, { days, commitments, logs });

const screens = [
  ['Now', [/Beat yesterday/i, /Currently working|Did you stop|Start day/i]],
  ['Day', [/Timeline/i, /Contained/i]],
  ['Plan', [/Log today/i, /What gets finished/i, /Left from earlier/i]],
  ['Progress', [/Targets/i, /days left/i]],
  ['Settings', [/Scoring/i, /Morning card/i, /Automatic backup/i]],
];

for (const [name, patterns] of screens) {
  step(name);
  await tab(name);
  const body = await bodyText(page);
  check('renders', body.length > 80, true);
  check('no NaN, undefined or Invalid Date', /NaN|undefined|Invalid Date/.test(body), false);
  for (const pattern of patterns) check(`shows ${pattern}`, pattern.test(body), true);
  await shot(page, `smoke-${name.toLowerCase()}`);
}

step('Progress — the other two horizons');
await tab('Progress');
for (const horizon of ['Month', 'History']) {
  await page.getByRole('button', { name: horizon, exact: true }).first().click();
  await page.waitForTimeout(1400);
  const body = await bodyText(page);
  check(`${horizon} renders`, body.length > 80, true);
  check(`${horizon} has no NaN`, /NaN|Invalid Date/.test(body), false);
  await shot(page, `smoke-${horizon.toLowerCase()}`);
}

step('Dark mode holds up');
await page.locator('[data-theme-toggle]').click();
await page.waitForTimeout(700);
check('switched to dark', await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
check('still no errors in dark', errors, []);
await page.locator('[data-theme-toggle]').click();

check('no page errors anywhere', errors, []);
await done(browser);
