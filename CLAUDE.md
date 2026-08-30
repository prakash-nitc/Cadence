# CLAUDE.md

Working agreement for Claude Code on this repo. Read `SPEC.md` before writing anything.

## What this is

A single-user planning and discipline app. One Windows laptop — desktop only, no phone
build and no phone layout. Local-only. No accounts, no server, no sync.

It plans a day the night before, tracks what actually got finished, and scores the day
honestly. It is intended as a long-term daily driver, not a tool for one roadmap.

`SPEC.md` is authoritative. `src/config/schedule.config.ts` is the current roadmap's data.
If they disagree, `SPEC.md` wins and the config gets fixed.

## The config / settings split

This one matters and is easy to get wrong:

- **`schedule.config.ts` — what the user is working on.** Timetable, subjects, milestones,
  weekly targets, commitment presets. Swapped out when a phase ends. Edited by committing.
- **Settings (Dexie `prefs`) — how the app behaves.** Thresholds, the non-negotiable gate,
  the non-negotiable list, planning slack, notification toggles. Persists across roadmaps.
  Edited in the app.

Rule of thumb: if it would need to change when the roadmap changes, it's config.
If it would stay the same, it's Settings.

Config constants seed Settings on first run **only**. After that the app reads prefs.
Never read `DEFAULT_PREFS` at runtime outside the first-run seeder.

## Rules for this codebase

1. **Never hardcode a clock time** outside `schedule.config.ts` or a default preference.
   Every schedule time derives from the day's anchor at runtime. If you're writing
   `"08:05"` in a component, reread SPEC §2.
2. **All persistence goes through `db/repo.ts`.** No component touches Dexie directly.
3. **Engines are pure.** Everything in `engine/` takes inputs and returns values. No I/O,
   no `Date.now()` inside — pass the clock in. They must be testable at arbitrary
   simulated dates, and they have tests. See SPEC §6 for the contracts.
4. **Scoring is not fudged.** Weight is planned minutes. Non-negotiables are a separate
   pass/fail gate, never an inflated weight. Displaced commitments leave both sides of the
   ratio. If a scoring change makes a band "feel better," it's wrong.
5. **No new dependencies without asking.** The stack in SPEC §1 is the stack.
6. **Design tokens only.** Colours come from the Tailwind theme names in SPEC §8
   (`ink`, `sunk`, `panel`, `edge`, `text`, `soft`, `muted`, `signal`, `deep`, `mint`,
   `wash`, `pass`, `warn`, `fail`, `info`). No raw hex in components, no arbitrary values
   like `bg-[#1a1a1a]`. Build screens from `components/ui/primitives.tsx` rather than
   re-deciding padding and radius per component.
   **Green stays at roughly a tenth of the surface** — SPEC §8's green rule is the easiest
   thing here to get wrong, and getting it wrong costs the bands their meaning.
   **Colour is never the only signal**: every band, status and pace figure carries its word.
7. **Copy discipline.** Active voice, sentence case, no exclamation marks. No
   encouragement, no scolding. Errors state what happened. Empty states say what to do.
   Failure states stay constructive without softening the fact: "Needs attention — 3 days
   below target" says the same thing as "3 RED DAYS" and is the version to write.
8. **Monospace is for system metrics.** Times, durations, counts, percentages and rates.
   Human content — task names, descriptions, navigation — is sans. That distinction is
   load-bearing; do not blur it.
9. **Build in the order in SPEC §9** and stop at each session's done-condition. Do not
   race ahead because the current session is nearly finished.

## What not to build

Anything in SPEC §10. Especially: **DSA revision, spaced repetition, problem banks, and
pattern tracking — those live in a separate app the user already built.** Also no points,
badges, cloud sync, LLM coach, dark mode, or a phone layout.

The consistency run is the one reversal, and it is allowed only on the terms in §10: it
counts days that cleared red, an unplanned day breaks it, and a placement day passes
through. Do not soften any of those — a run that is easy to hold measures nothing. The
activity heatmap beside it is *not* a streak: it shows what work landed, nothing resets,
and a missed day costs nothing.

If a feature idea arrives mid-build that isn't in the spec, write it in `IDEAS.md` and
carry on.

## Commits

Small and frequent, conventional-commit style (`feat:`, `fix:`, `refactor:`, `test:`).
One commit per meaningful unit — not one per session.

## Verification before calling a session done

- `npm run build` passes clean
- `npx tsc --noEmit` passes with zero errors — `any` is not a fix
- `npm run test` passes
- The done-condition in SPEC §9 is actually met, checked by using the app, not by reading
  the code
