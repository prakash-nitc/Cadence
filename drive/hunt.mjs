/**
 * A bug hunt over the awkward cases: a block pushed after it ended, a day nobody planned,
 * a threshold changed mid-week, an import on top of live data, and long labels at a narrow
 * window. Each is a place where a rule meets a corner it was not written for.
 */
import { bodyText, checker, open, seed, shot, storedCommitments, tabber } from './lib.mjs';

const { check, step, done } = checker();
const { browser, page, errors } = await open({ clock: '2026-10-02T11:30:00' });
const tab = tabber(page);
const flat = async () => (await bodyText(page)).replace(/\s+/g, ' ');

const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00`);
const block = (date, id, label, from, to, over = {}) => ({
  blockId: id, label, detail: null, kind: 'work', priority: 1,
  minutes: (at(date, to) - at(date, from)) / 60_000,
  startsAt: at(date, from), endsAt: at(date, to), status: 'pending', actualEndedAt: null,
  missedWindow: false, straddles: null, window: null, ...over,
});
const day = (date, blocks, over = {}) => ({
  date, anchorAt: at(date, '07:00'), template: 'full', blocks, degradation: [], pushes: [],
  interruptions: [], placementMode: false, score: null, band: null, gatePassed: null,
  plannedAt: at(date, '06:00'), plannedBlocks: null, plannedAnchor: null, ...over,
});

// ── 1. A block pushed while it runs ─────────────────────────────────────────
step('A block pushed near its end: does the timer keep counting into the extra time?');
await seed(page, {
  days: [
    day('2026-10-02', [
      // Running, five minutes from its end, timed since 10:00.
      block('2026-10-02', 'dsa_deep', 'DSA deep block', '10:00', '11:35', {
        timer: [{ start: at('2026-10-02', '10:00'), end: null, seen: at('2026-10-02', '11:30') }],
      }),
    ]),
  ],
  commitments: [
    { id: 'rev', dayDate: '2026-10-02', blockId: 'dsa_deep', label: 'DSA Revision', targetType: 'minutes', target: 120, done: 0, plannedMinutes: 120, tags: ['dsa'], status: 'open', displacedBy: null, movedCount: 0, originDate: '2026-10-02', routine: true },
  ],
});
await tab('Now');
check('it is timing', await page.locator('[data-block-timer]').getAttribute('data-block-timer'), 'running');
await page.getByRole('button', { name: '+30' }).click();
await page.waitForTimeout(1200);
check('the block now ends later', /10:00–12:05/.test(await flat()), true);
// Past the old end: the timer must follow the boundary it was given, not the one it had.
// runFor, not fastForward: a jump is a sleeping laptop, and the timer is right to stop for it.
await page.clock.runFor(10 * 60_000);
await page.waitForTimeout(800);
check('still timing past the old end', await page.locator('[data-block-timer]').getAttribute('data-block-timer'), 'running');
const timed = await page.locator('[data-timer-value]').innerText();
check('and counting past 1h 35m', /1:3[6-9]|1:4\d|1:5\d/.test(timed), true);
console.log(`    timer reads ${timed.trim()}`);
await shot(page, 'hunt-push');

// ── 2. A day nobody planned ─────────────────────────────────────────────────
step('A day with no plan and no commitments');
await seed(page, { days: [day('2026-10-02', [], { plannedAt: null })], commitments: [] });
for (const screen of ['Now', 'Day', 'Plan', 'Progress']) {
  await tab(screen);
  const body = await bodyText(page);
  check(`${screen} stands up`, body.length > 60, true);
  check(`${screen} has no NaN`, /NaN|Invalid Date/.test(body), false);
}
await tab('Day');
check('an unplanned day says so rather than scoring well', /red|not planned|Nothing committed/i.test(await flat()), true);

// ── 3. A threshold changed mid-week ─────────────────────────────────────────
step('Raising the green threshold changes the band, not the history');
await seed(page, {
  days: [day('2026-10-01', [block('2026-10-01', 'dsa_deep', 'DSA deep block', '09:00', '11:00', { status: 'contained', workedMinutes: 120 })])],
  commitments: [
    { id: 'c1', dayDate: '2026-10-01', blockId: 'dsa_deep', label: 'DSA', targetType: 'count', target: 4, done: 3, plannedMinutes: 120, tags: ['dsa'], status: 'partial', displacedBy: null, movedCount: 0, originDate: '2026-10-01', routine: true },
  ],
  logs: [{ date: '2026-10-01', recallDrillDone: true, sleepHours: 7, energy: 3, hardestThing: '', wentWell: '', wentWrong: '', toImprove: '', blocksContained: 1, blocksTotal: 1, createdAt: at('2026-10-01', '22:00') }],
});
await tab('Settings');
await page.getByLabel(/Green threshold/i).fill('90');
await page.waitForTimeout(900);
await tab('Progress');
const band = await flat();
check('Progress re-reads the threshold without a reload', /75%|yellow|red/i.test(band), true);
check('and nothing breaks', /NaN/.test(band), false);
await tab('Settings');
await page.getByLabel(/Green threshold/i).fill('80');
await page.waitForTimeout(700);

// ── 4. Import on top of live data ───────────────────────────────────────────
step('Export, change things, import the export back');
await tab('Settings');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /Export everything/ }).click(),
]);
const file = await download.path();
check('an export arrives', typeof file === 'string', true);

await seed(page, {
  commitments: [
    { id: 'after-export', dayDate: '2026-10-02', blockId: 'flex', label: 'Added after the export', targetType: 'binary', target: 1, done: 0, plannedMinutes: 30, tags: [], status: 'open', displacedBy: null, movedCount: 0, originDate: '2026-10-02', routine: false },
  ],
});
check('the new commitment is there', (await storedCommitments(page)).some((c) => c.id === 'after-export'), true);

await tab('Settings');
await page.getByRole('button', { name: /^Import/ }).click();
await page.waitForTimeout(400);
await page.setInputFiles('input[type="file"]', file);
await page.waitForTimeout(2000);
const imported = await storedCommitments(page);
check('importing replaces what came after it', imported.some((c) => c.id === 'after-export'), false);
check('and restores what was in the file', imported.some((c) => c.id === 'c1'), true);
check('the app still runs after an import', /Settings|Scoring/i.test(await flat()), true);

// ── 5. Long labels at a narrow window ───────────────────────────────────────
step('A very long commitment name at 1100px');
await page.setViewportSize({ width: 1100, height: 900 });
await seed(page, {
  days: [day('2026-10-02', [block('2026-10-02', 'dsa_deep', 'DSA deep block', '09:00', '13:00')])],
  commitments: [
    { id: 'long', dayDate: '2026-10-02', blockId: 'dsa_deep', label: 'Spring Boot repository layer with pagination, custom exception handling and DTO mapping across three entities', targetType: 'minutes', target: 240, done: 30, plannedMinutes: 240, tags: ['spring'], status: 'partial', displacedBy: null, movedCount: 0, originDate: '2026-10-02', routine: false },
  ],
});
for (const screen of ['Now', 'Day', 'Plan']) {
  await tab(screen);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${screen} does not scroll sideways`, overflow <= 0, true);
}
await shot(page, 'hunt-long-label');

// ── 6. A block that crosses midnight ────────────────────────────────────────
step('A late block running past midnight');
await page.setViewportSize({ width: 1440, height: 900 });
await seed(page, {
  days: [
    day('2026-10-01', [
      block('2026-10-01', 'dsa_deep', 'DSA deep block', '22:30', '23:59', { status: 'contained', workedMinutes: 80 }),
      // 23:59 → 01:30 the next morning, answered for.
      { ...block('2026-10-01', 'spring_1', 'Spring Boot', '23:59', '23:59'), endsAt: at('2026-10-02', '01:30'), minutes: 91, status: 'contained', workedMinutes: 85 },
    ]),
  ],
  commitments: [
    { id: 'late', dayDate: '2026-10-01', blockId: 'spring_1', label: 'Notes API', targetType: 'minutes', target: 90, done: 85, plannedMinutes: 90, tags: ['spring'], status: 'partial', displacedBy: null, movedCount: 0, originDate: '2026-10-01', routine: true },
  ],
});
await tab('Now');
const beatLate = await page.locator('[data-beat]').innerText();
check('yesterday counts both answered blocks, across midnight', /2h 45m/.test(beatLate), true);
console.log('    ' + beatLate.replace(/\s+/g, ' ').slice(0, 120));

await tab('Progress');
await page.getByRole('button', { name: 'Month', exact: true }).first().click();
await page.waitForTimeout(1600);
const monthLate = await flat();
check('the month renders with a block crossing midnight', /Focused time/.test(monthLate), true);
check('no NaN from the midnight span', /NaN|Invalid/.test(monthLate), false);
const hours = await page.locator('[data-chart="peak"]').last().innerText();
console.log('    hour chart: ' + hours.replace(/\s+/g, ' ').slice(0, 90));

check('no page errors through all of it', errors, []);
await done(browser);
