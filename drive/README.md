# drive

Browser suites that drive the real app. They are how this project finds bugs: types and
unit tests have passed many times while the page itself was wrong.

They live here, in the repo, on purpose. They used to live in a temp folder, and Windows
cleared it — thirty-odd suites went with it. Nothing that took effort to write belongs
outside version control.

## Running them

```bash
npm run dev                 # in the repo root, serving http://localhost:5178
cd drive && npm install     # once
node smoke.mjs              # any suite
SHOTS=./shots node smoke.mjs   # and write screenshots
```

- `URL` overrides the address (default `http://localhost:5178/`).
- `BROWSER` overrides the browser executable. It defaults to the installed Brave, because
  Playwright's own Chromium download times out on this machine. Both are the same engine.

Playwright is **not** in the app's `package.json`: the app ships nothing from here.

## Writing one

- Assert on **what a person would read** — `main`'s text — not on CSS classes. Markup
  changes with every restyle; text survives it.
- For structure text cannot identify, add a `data-*` hook to the component and use that.
- **Always check it survives a reload.** That single assertion has found more persistence
  bugs than everything else here.
- Assert `errors` is empty at the end: a runtime error no assertion covers is still a bug.
- Pin the clock with `clock:` and, where exact timings matter, `page.clock.pauseAt` so page
  loads do not quietly add seconds.
- Seed through `seed(page, { days, commitments, logs })` rather than clicking a history into
  existence.

## Suites

| File | Covers |
|---|---|
| `smoke.mjs` | Every screen renders with a fortnight of history: no NaN, no page errors, in both themes |
| `fixes.mjs` | Pausing a weekly target, unanswered blocks not claiming timer minutes, the morning card's fold being remembered |

The rest were lost with the temp folder and are being rebuilt as each area is next touched.
