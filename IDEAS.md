# IDEAS

Feature ideas that arrived mid-build and are **not** in `SPEC.md`. Nothing here gets
built without first moving into the spec. Parking a thing here is how it stops
derailing the current session.

Check against SPEC §10 before adding — most good-sounding ideas are already ruled out
there on purpose.

_(empty)_

## Parked

- **Friday maintenance block.** `FRIDAY_MAINTENANCE_MINUTES` in config says the last
  45 minutes of Friday's sequential block go to one completed subject, app picking the
  longest-untouched. SPEC §3.4 does not list it among the plan suggestions, so it is not
  wired up. Needs a spec change before it gets built.

## Suggested, not built (2026-09-04)

Offered during the look-and-feel pass and left for a later decision.

- **Insights from your own records.** Cadence logs sleep hours, energy 1–5, containment
  and a score for every day, and uses none of them together. "You contain 82% of blocks
  that start before noon and 41% after four" or "on nights under seven hours you score a
  median 54%" are real correlations from real data. The highest-value unbuilt thing.
- **Keyboard-first quick add.** Desktop-only app with no shortcuts at all. `N` to commit
  to something, `G` then a letter to move between screens.
- **Non-negotiables always visible.** The gate currently appears only once it has failed,
  which is the one moment it cannot help. A standing "1 of 2" would let you act at three
  in the afternoon rather than find out at eleven at night.
- **Templates that know the weekday.** `suggestedTemplate` already picks by day; a saved
  arrangement could be pinned to a weekday so Tuesday always opens as Tuesday.
- **A "what changed" line on Progress.** Week-over-week deltas per target, not just the
  overall band count.

## Built (2026-09-11)

Insights, interruptions, the review log, per-target deltas, the closing card, the week
density pass and block settle all shipped. Still parked from that list:

- **Focus mode.** One key dims everything but the running block. Not Pomodoro — no
  intervals, nothing new timed. Wanted a keyboard layer first.
- **Non-negotiables always visible.** The gate still only appears once it has failed.
- **Keyboard shortcuts.** Desktop-only app, still none.
- **Weekday templates.** Pin a saved arrangement to a weekday.
