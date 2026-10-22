/**
 * Hours come from the time you said you worked — reported as a bug.
 *
 * A DSA block with "DSA problems — 4", two done, planned at 4h, closed with "worked 3h 20m".
 * The hours targets and focus charts showed 2h: planned minutes times the share of problems
 * finished. The answer to "how long did you work" changed nothing.
 */
import { bodyText, checker, open, seed, shot, tabber } from './lib.mjs';

const { check, step, done } = checker();
const { browser, page, errors } = await open({ clock: '2026-10-22T20:00:00' });
const tab = tabber(page);
const flat = async () => (await bodyText(page)).replace(/\s+/g, ' ');

const D = '2026-10-21';
const at = (hhmm) => Date.parse(`${D}T${hhmm}:00`);
const block = (id, label, from, to, over = {}) => ({
  blockId: id, label, detail: null, kind: 'work', priority: 1, minutes: (at(to) - at(from)) / 60_000,
  startsAt: at(from), endsAt: at(to), status: 'contained', actualEndedAt: at(to),
  missedWindow: false, straddles: null, window: null, ...over,
});
const commitment = (id, blockId, label, targetType, target, done, planned, tags) => ({
  id, dayDate: D, blockId, label, targetType, target, done, plannedMinutes: planned, tags,
  status: done >= target ? 'complete' : done > 0 ? 'partial' : 'open',
  displacedBy: null, movedCount: 0, originDate: D, routine: true,
});

step('Seed: a DSA block worked 3h 20m, two of four problems done; theory worked 1h of a 2h plan');
await seed(page, {
  days: [{
    date: D, anchorAt: at('07:00'), template: 'full',
    blocks: [
      block('dsa_deep', 'DSA deep block', '09:00', '13:00', { workedMinutes: 200 }),
      block('dsa_second', 'Second DSA pass', '14:00', '16:00', { workedMinutes: 60 }),
    ],
    degradation: [], pushes: [], interruptions: [], placementMode: false, score: null, band: null,
    gatePassed: null, plannedAt: at('06:00'), plannedBlocks: null, plannedAnchor: null,
  }],
  commitments: [
    commitment('p', 'dsa_deep', 'DSA problems', 'count', 4, 2, 240, ['dsa', 'dsa_new']),
    // Theory finished in full in half the planned time: hours are the time, not the plan.
    commitment('t', 'dsa_second', 'Graph patterns', 'binary', 1, 1, 120, ['dsa', 'dsa_theory']),
  ],
});

step('Progress → Week: the hours targets');
await tab('Progress');
const week = await flat();
const read = (label) => (week.match(new RegExp(`${label} ([\\d.]+) / \\d+ hrs`)) ?? [])[1] ?? null;
console.log(`    DSA hours ${read('DSA hours')}, DSA theory hours ${read('DSA theory hours')}`);
check('DSA hours count the 4h 20m worked, not 4h of plan × completion', read('DSA hours'), '4.3');
check('DSA theory hours count the 1h worked, not the 2h planned', read('DSA theory hours'), '1');
await shot(page, 'hours-week');

step('Progress → Month: focused time');
await page.getByRole('button', { name: 'Month', exact: true }).first().click();
await page.waitForTimeout(1500);
const month = await flat();
check('focused time is the 4h 20m worked', /Total focused time: 4h 20m/.test(month), true);
check('and DSA holds all of it', /DSA 100% 4h 20m/.test(month), true);

step('The day score still judges what was finished, not how long it took');
// Problems: 240 planned × ½ = 120. Theory: 120 × 1 = 120. 240 of 360 committed = 67%.
await page.clock.pauseAt(new Date(`${D}T21:00:00`)).catch(() => {});
await tab('Progress');
await page.getByRole('button', { name: 'Week', exact: true }).first().click();
await page.waitForTimeout(1200);
const cell = await page.locator(`[title^="${D}"], [title*="21 Oct"]`).first().getAttribute('title').catch(() => null);
console.log(`    day cell: ${cell}`);
check('the score is 67%, from completion, whatever time was put in', /67%/.test(cell ?? (await flat())), true);

check('no page errors', errors, []);
await done(browser);
