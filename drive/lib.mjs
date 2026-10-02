/**
 * Shared helpers for the browser suites.
 *
 * These suites drive the real app in a real browser, because that is what has caught the
 * bugs here: types and unit tests passed while the page was wrong. They live in the repo —
 * they used to live in a temp folder, and Windows cleared it, taking every suite with it.
 *
 * Playwright stays out of the app's package.json: the app ships nothing from here.
 */
import { chromium } from 'playwright';

/**
 * Playwright's own Chromium download times out on this machine, and Brave is the same engine
 * and already installed. BROWSER overrides it; leaving it unset uses Playwright's Chromium
 * when one has been downloaded, which is the better default anywhere else.
 */
const BRAVE = 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';

export const URL = process.env.URL ?? 'http://localhost:5178/';
export const SHOTS = process.env.SHOTS ?? null;

export async function open({ width = 1440, height = 900, clock = null } = {}) {
  const executablePath = process.env.BROWSER ?? BRAVE;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await context.newPage();

  // Runtime errors no assertion would catch. This has found more faults than the assertions.
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log('!! PAGE ERROR:', error.message);
  });

  if (clock) {
    await page.clock.install({ time: new Date(clock) });
  }
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  return { browser, context, page, errors };
}

export function checker() {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(
      `    ${ok ? 'PASS' : 'FAIL'}  ${label}` +
        (ok
          ? ''
          : `\n           expected ${JSON.stringify(expected)}\n           actual   ${JSON.stringify(actual)}`),
    );
    if (!ok) failures++;
  };
  const step = (title) => console.log(`\n[${title}]`);
  const done = async (browser) => {
    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
    await browser.close();
    process.exit(failures === 0 ? 0 : 1);
  };
  return { check, step, done };
}

/** Switch screens the way a person does, and wait for the render. */
export const tabber = (page) => async (name) => {
  await page.getByRole('button', { name, exact: true }).first().click();
  await page.waitForTimeout(1100);
};

export const bodyText = (page) => page.locator('main').innerText();

export async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Write rows straight into IndexedDB, then reload so the app reads them. */
export async function seed(page, stores) {
  await page.evaluate(async (payload) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cadence');
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });
    for (const [store, rows] of Object.entries(payload)) {
      await new Promise((resolve) => {
        const tx = db.transaction(store, 'readwrite');
        for (const row of rows) tx.objectStore(store).put(row);
        tx.oncomplete = resolve;
      });
    }
  }, stores);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
}

/** Every commitment in the database, for checking what was actually stored. */
export const storedCommitments = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open('cadence');
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise((resolve) => {
      const out = [];
      const cursor = db.transaction('commitments').objectStore('commitments').openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return resolve(out);
        out.push(entry.value);
        entry.continue();
      };
    });
  });
