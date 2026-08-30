# BUILD SPEC — "Cadence"

A single-user planning and discipline app. Replaces a roadmap document with one screen
that answers: **what did I commit to today, how much of it is left, and am I holding
the line?**

Built for one person, on one Windows laptop and one Android phone. No accounts, no
sync, no multi-user anything. Every decision below assumes that.

**This app is meant to outlive its first roadmap.** The Build Phase (Aug–Dec 2026) is the
first thing loaded into it, not the thing it is. That constraint shows up as a hard split:

- `src/config/schedule.config.ts` — **what you're working on.** Timetable, subjects,
  milestones. Swapped out when a phase ends. Edited by committing, not by clicking.
- **Settings** — **how the app behaves.** Thresholds, gates, non-negotiables,
  notifications. Persists across roadmaps. Edited in the app.

If a thing would need to change when the roadmap changes, it goes in config. If it would
stay the same, it goes in Settings.

---

## 0. Non-negotiables for whoever builds this

1. **Ship Tier 1 + Tier 2 in one weekend.** If a feature is not in this spec, it does
   not go in v1. Scope creep here is the failure mode, not a missing feature.
2. **No wall-clock hardcoding.** Every schedule time is derived at runtime from the
   day's anchor. If you find yourself typing `"08:05"` anywhere outside config or a
   default preference, stop.
3. **Local-first.** IndexedDB via Dexie. No network calls except loading fonts. The app
   must work fully with the phone in airplane mode.
4. **Data is exportable.** One button dumps everything to JSON. The user version-controls
   his own history. Never make it hostage to a browser profile.
5. **Honest UI.** A missed commitment is marked missed, permanently. No encouraging
   euphemisms, no "you'll get it tomorrow" toasts. Rule 10 is *track honestly* — the
   interface enforces it by not offering a convenient way to lie.
6. **DSA revision is out of scope.** It lives in a separate app the user already built.
   Do not build spaced repetition, problem banks, or pattern tracking here.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + React 18 + TypeScript | Fast, boring, well-trodden |
| Styling | Tailwind CSS | Config-driven tokens, see §8 |
| State | Zustand | Small, no boilerplate |
| Storage | Dexie (IndexedDB wrapper) | localStorage caps at ~5MB and is synchronous |
| Dates | date-fns | Do not use Moment |
| Drag/drop | dnd-kit | Custom day builder only |
| Charts | None. Hand-rolled SVG/CSS bars | A charting lib for eight progress bars is absurd |
| PWA | vite-plugin-pwa | Installable, offline, service worker |
| Native wrap | Capacitor (final step) | Real Android scheduled notifications |

Node 20+. npm. No monorepo.

```
src/
  config/
    schedule.config.ts      # roadmap data — see companion file
  engine/
    layout.ts               # anchor + template + fixed windows -> ScheduledBlock[]
    capacity.ts             # late-start degradation
    scoring.ts              # commitment completion -> day score + band
    feasibility.ts          # plan-time reality checks
    pacing.ts               # weekly required-rate and debt calculations
  db/
    schema.ts
    repo.ts                 # all persistence goes through here
  store/
    dayStore.ts
    planStore.ts
    prefsStore.ts
  screens/
    Now.tsx
    Day.tsx
    Plan.tsx
    Progress.tsx
    Settings.tsx
  components/
    DayBar.tsx              # signature element, see §8
    BurnDown.tsx
    CommitmentRow.tsx
    ScoreBadge.tsx
    BlockBuilder.tsx
    WeekShape.tsx
    ConsistencyGrid.tsx
    MilestoneRow.tsx
    TargetBar.tsx
  lib/
    notify.ts
    time.ts
  App.tsx
  main.tsx
```

---

## 2. The elastic day engine

Blocks are time containers. Get this right and the rest is CRUD.

### 2.1 Concepts

**BlockDef** — a template entry: `id`, `label`, `minutes`, `kind`
(`work | break | meal | routine`), `priority`, optional `minMinutes` for compressible
blocks.

**FixedWindow** — mess timings. Breakfast 07:00–09:00, lunch 13:00–14:00, dinner
20:00–21:00. The only wall-clock facts in the system, because the mess doesn't care when
the user woke up.

**Anchor** — the timestamp when the user taps **Start day**. If he opens the app after
noon without having started, prompt for the anchor with a time picker defaulting to now.
Never silently backdate.

**ScheduledBlock** — the output. `blockId`, `startsAt`, `endsAt`, `status`
(`pending | active | contained | overran | skipped`), `actualEndedAt`.

### 2.2 The layout algorithm

```
layoutDay(anchor: Date, template: BlockDef[], windows: FixedWindow[]): ScheduledBlock[]
```

1. Cursor starts at `anchor`.
2. Walk the template in order. Assign `startsAt = cursor`, `endsAt = cursor + minutes`,
   advance cursor.
3. **Meal handling.** A `meal` block has a matching FixedWindow.
   - Cursor before the window opens → idle forward to window open, emit a `gap`
     (unallocated time, shown honestly, not as failure).
   - Cursor inside the window → place at cursor.
   - Cursor past window close → place at cursor and flag `missedWindow: true`.
     The app is not going to pretend the mess is open.
4. **Collision.** If a `work` block would straddle a window opening, do not split it —
   place it fully before or fully after. Splitting a deep work block is worse than eating
   late.
5. **Compute once per day. Persist.** Do not recompute on render or on tick.

### 2.3 Boundaries are immutable once laid

After `Start day`, boundaries do not move on their own.

- **Finishing early does not shift the next block up.** Show the free time honestly:
  *"22 min free until Spring Boot."* A `Start next block early` button exists but warns:
  *"Moves every remaining boundary earlier by 22 min."* Default is no.
- **Skipping leaves a hole.** Status `skipped`, time is dead, nothing moves. This is
  Rule 4 — *a failed block ends at the block boundary, no cascading.*
- **Overrunning is recorded, not accommodated.** When `endsAt` passes without the block
  being closed, it flips to `overran` and the next block goes `active` regardless.
- **`Push remaining by N`** (15 / 30 / 60) is explicit and logged. Frequency of use is
  itself a metric — surface it in the Sunday review.

### 2.4 Capacity and degradation

At `Start day`, compute available time from anchor to soft day end (Settings, default
22:45). If the template doesn't fit, degrade in this order and show exactly what was cut:

| Priority | Blocks | Behaviour |
|---|---|---|
| 0 — Protected | DSA deep block (min 90), Spring Boot (min 120), recall drill (20), plan+log (20) | Never auto-dropped. Compress only to `minMinutes`. |
| 1 — Compressible | Sequential track (min 60), wind-down | Shrink before dropping |
| 2 — Droppable | Flex, second DSA pass, tea break | Dropped first |
| 3 — Fixed | Meals, gym | Gym drops past `GYM_CUTOFF_HOUR`; meals never drop |

Confirmation copy states facts:

> Anchored at 09:20. Capacity 7h 10m against a 9h 30m template.
> Dropping: flex block, second DSA pass. Sequential track cut to 60 min.
> DSA and Spring Boot intact.

### 2.5 Day templates

Built in: `full`, `lateNight`, `saturday`, `sunday`, `recovery`. See config.
`lateNight` reorders so DSA still comes first — Rule 1 is "before anything else today,"
not "at 08:05."

### 2.6 Arranging a day, and saved templates

**A template is the ideal day, not a rule.** It describes the shape you would keep if
nothing interfered. Placement season means it often does interfere, so every day can be
arranged from that starting point instead of obeying it.

**Arrange.** Start from any template or blank. Add, remove, reorder (dnd-kit) and resize
blocks. Attach commitments per §4.1.

Every row shows **the clock time it will actually land at**, computed by running
`layoutDay` on each edit — not by adding durations up in the component. What the builder
shows is exactly what Start day will lay out, meal windows and all. Arranging a day blind
is the same as not being able to arrange it: a block dragged without knowing it pushes
lunch to 14:15 has not really been planned.

The builder therefore also shows, live:

- the wait before a meal that idles forward to its window
- a warning on any meal whose window has already closed
- total committed against available, and by how much it is over

**An arranged day is laid exactly as arranged.** Degradation (§2.4) exists to fit a
*template* to a late start automatically. Running it over an explicit arrangement would
silently undo decisions the user has just made, and would make the clock times shown
while arranging a lie. The capacity readout states the position; the user decides.

**Save as template.** Named, stored in Dexie alongside the config templates, appearing in
the same picker. Expected: "OA day," "Interview day," "Travel day," "Late start." Built
once, reused all season. User templates are editable and deletable; config templates are
not.

**Quick carve.** *"I have N hours today."* The app fills N with protected work — every
block that fits gets its floor before any block is topped up — and states what did not
fit:

> 4h carved. DSA 2h, Spring Boot 2h.
> Not fitting: sequential track, flex.

**Re-lay the rest of the day.** A day already anchored can be re-arranged from now.
Everything already resolved stays exactly as it was — re-planning the afternoon must not
erase the morning. Without this, picking the wrong template in the morning is unrecoverable.

## 3. Features — Tier 1

### 3.1 Now screen (home)

Read at arm's length in under two seconds.

- **Current block**, large. Label, remaining, linear progress.
- **Countdown**, monospace numerals. Amber at 5 minutes. At 0 the copy is **STOP**.
- **This block's commitments** — checklist, tappable, with targets
  (*"Tree problems — 2 / 4"*). The reason the block exists.
- **Burn-down strip** — remaining committed minutes vs remaining available minutes.
  Red when committed exceeds available, with the gap: *"4h 20m committed, 3h 05m left."*
- **Live projected score** — *"On pace: 64%."* Visible from mid-morning, not discovered
  at 10 PM.
- **Next block**, one line, muted.
- **Rule of the day**, one line, rotating from config.
- **Actions:** `Done — contained` · `Skip block` · `Push remaining` · `Triage day`
- **Unanchored state:** the whole screen is a **Start day** button plus template picker.
  If tomorrow was planned last night, show its commitment count: *"7 commitments waiting."*

### 3.2 Day screen

Vertical timeline of today's blocks with computed times and current position. Each row
shows status and its commitments with completion state. Tapping a past block allows
honest correction — but there is no control that converts a skip into a containment.

Header carries the **Day Bar** (§8) and totals: committed vs completed weight, live score,
band.

### 3.3 Block containment

The metric that tells you whether the schedule is real or decorative. On block end, fire a
notification; on next open show a full-width prompt: **Did you stop?** →
`Stopped on time` / `Ran over`. Two taps, no free text.

Tracked separately from the day score. Containment measures whether you respect
boundaries; the score measures whether you finished the work. A day can be 100% complete
and badly uncontained, and that's worth knowing.

### 3.4 Plan and log (evening, one flow)

Two parts, one sitting. **Target: under three minutes total.** If it takes longer the user
stops doing it and nothing else in the app works.

**Part 1 — Log today.** Every field prefilled from what the app already knows.

| Field | Source |
|---|---|
| Commitment completion | already tapped through the day; confirm only |
| Blocks contained | auto, read-only |
| Recall drill done | yes/no — the drill itself lives in the other app |
| Sleep hours | manual |
| Energy 1–5 | manual |
| Hardest thing today | free text, one line |

**Part 2 — Plan tomorrow.** Pre-composed, not blank:

1. Pick tomorrow's template (default from weekday, or a saved custom one).
2. Carry-overs appear first, pre-selected, with move-count badges.
3. Roadmap-derived suggestions fill the rest — current sequential subject, current Spring
   Boot phase, current DSA topic, all read from config.
4. User edits targets, adds, removes.
5. Feasibility check runs (§4.2) and shows the verdict before the plan can be saved.

The flow does not submit without at least one commitment for tomorrow. Everything else
can be blank. This is the single most load-bearing interaction in the app — an unplanned
day is a red day by definition, so the app should make planning nearly frictionless and
skipping it unmistakably visible.

### 3.5 Notifications

Implementation in §7. The set:

| Trigger | Copy |
|---|---|
| Block start | `SPRING BOOT. 1h 40m. 2 commitments.` |
| 5 min before end | `5 minutes. Start closing.` |
| Block end | `STOP. Block over.` |
| Midday pace check | `On pace: 58%. 3h 20m left.` |
| Burn-down goes negative | `Over-committed by 1h 15m. Triage.` |
| Plan + log block | `Log today. Plan tomorrow.` |
| Screens off | `Screens off. Book.` |
| Not anchored by 10:00 | `Day not started.` |

All individually toggleable in Settings.

---

## 4. Features — Tier 2

### 4.1 Commitments and day scoring

**This is the core of the app.** Blocks are time containers; commitments are what you
actually finish. The gap between them is where days go wrong — you can sit in a 3-hour DSA
block and finish one problem. Block time says 100%. Reality says 25%.

**Commitment shape:**

```ts
{
  id, dayDate, blockId,
  label: string,                  // "Tree problems", "PaperTrail repository layer"
  targetType: 'count' | 'binary' | 'minutes',
  target: number,                 // 4 problems | 1 | 90 minutes
  done: number,
  plannedMinutes: number,         // the weight
  tags: string[],                 // 'dsa' | 'spring' | 'sequential' | 'placement' | ...
  status: 'open' | 'complete' | 'partial' | 'skipped' | 'avoided' | 'displaced',
  displacedBy?: string,
  movedCount: number,
}
```

**Scoring:**

```
weight              = plannedMinutes
completion          = clamp(done / target, 0, 1)        // partial credit
dayScore            = Σ(weight × completion) / Σ(weight)   over non-displaced commitments
```

Displaced commitments leave both numerator and denominator — they never happened, and the
day is scored on what remained. Skipped and avoided stay in the denominator at zero.

**Why minutes and not manual weights.** Minutes are already known, need no extra decision
at plan time, and are roughly proportional to what matters. A 3-hour Spring Boot block
correctly counts nine times a 20-minute task.

**The gate.** Minutes-weighting leaves cheap non-negotiables nearly invisible — skip both
the recall drill and the log and you still score 94%. Rather than inflate their weight
and corrupt the arithmetic, score them **separately, pass/fail**. With the gate on, a day
cannot be green with one missed, whatever the percentage says:

> 94% — yellow. Recall drill missed.

Two numbers, each meaning one thing, neither distorted to compensate for the other.

**The gate is a Settings toggle** (`nonNegotiableGate`, default on), and the
non-negotiable list is **user-editable** (`nonNegotiables: string[]` of commitment tags
or block ids, default `['recall', 'log']`). The Build Phase decides today's list; the app
does not hardcode it.

**Bands:**

| Band | Condition |
|---|---|
| Green | `≥ greenThreshold` (default 80) **and** gate passed |
| Yellow | `yellowThreshold`–`greenThreshold` (default 55–79), **or** ≥ green with gate failed |
| Red | `< yellowThreshold`, **or** the day was never planned |

Thresholds live in Settings. **An unplanned day is red regardless of what got done** —
that's the behaviour this app exists to kill, so it's the one thing it's unambiguous about.

**Dropping a commitment requires a reason.** Three options, and the distinction is the
whole point:

| Reason | Effect |
|---|---|
| **Displaced** | Something declared higher-priority took the slot — OA, interview, thesis deadline, health, family. Removed from scoring. Accrues to weekly debt. |
| **Skipped** | Nothing took the slot. Scores zero, fails the gate if non-negotiable. |
| **Avoided** | Same scoring as skipped, but tagged. Exists because Rule 10 is *track honestly* and the app shouldn't make dishonesty the path of least resistance. |

The guard against everything becoming "displaced" is that debt is visible weekly and does
not clear (§4.3).

**Carry-over and avoidance detection.** Undone commitments go to a pool and appear first
in tomorrow's plan with a move-count badge. At **three moves**, the app offers exactly two
options: *"Moved 3 times. Do it first tomorrow, or delete it."* No third move. This
surfaces avoidance in three days instead of three weeks.

**Triage.** When burn-down goes negative, `Triage day` lists commitments in reverse
priority and lets the user cut until the day is feasible again, re-scoring live. The app
does not say "hurry." Deciding at 2 PM that today is a three-commitment day is discipline.
Discovering at 11 PM that you did 4 of 9 is not.

### 4.2 Plan-time feasibility

80% of an honest plan is achievable. 80% of an aspirational one is not. The fix goes at
plan time, not at score time.

**Slack rule.** Plan to `planningSlack` of available time (Settings, default 85%). Nine
hours free means committing seven and a half. The slack is the plan, not a shortfall.
Exceeding it warns but doesn't block.

**History check.** After 14 logged days, compare each commitment against the user's own
record for that tag: *"5 problems. You've hit 4+ twice in 14 days."* Stated before
committing, not after failing. Never blocks — it's a number, not a veto.

**Verdict line** before save: *"7h 10m committed against 8h 30m available. Within slack."*

### 4.3 Weekly view

Read-only. Fed entirely by daily commitments — nothing is logged twice.

**Week shape** — the metric that actually matters, more than any single day:

> 4 green · 2 yellow · 1 red — target met

Targets in Settings, default ≥4 green, ≤2 yellow, ≤1 red. **Three yellows is the early
warning** — that's the pattern that precedes collapse, and it should be called out by
name, not just rendered.

**The targets are yours.** `schedule.config.ts` declares the roadmap's set; Settings then
lets you rename one, change its numbers and warning line, hide what you are not tracking,
and add your own. Only departures from config are stored, so a roadmap swap still moves
every target you have not deliberately changed.

A target's **tag is fixed once set**. The tag is what counts commitments, so changing it
would empty the number rather than rename it. Rename the label freely; to count something
differently, hide the target and add a new one.

**Required daily rate.** This is what creates urgency on a Wednesday:

> Spring Boot 6.5 / 15 hrs. 3 days left. **Need 2.8 hrs/day.**

Shown for every weekly target from config. When the required rate exceeds what a day can
physically hold, say so plainly: *"Not reachable this week. Short by 4 hrs."*

**Displacement debt.** Per tag, per week:

> Spring Boot 9 / 15 hrs. Displaced twice — OA, interview.

Debt does not clear. Spring Boot below its `warnBelow` flags red regardless of how
legitimate each individual displacement was. Rule 2 stays intact — enforced at the week,
where it belongs, rather than at the day, where it would be wrong.

**Also on this screen:** containment percentage, push-count, avoided-count, energy trend.

#### 4.4 Monthly view and milestones

**Monthly targets.** A month carries its own numbers, set in the app and stored per month.
They are neither roadmap constants nor app behaviour: a monthly target is a *plan for one
specific month*, the way commitments are a plan for one specific day. September can be
heavier because SQL finishes; October lighter because interviews start.

Each month seeds from the weekly targets scaled to its length — 15 Spring Boot hours a
week becomes 64 for a 30-day month — and is then edited. Only what the user changes is
stored; everything else follows the weekly number, so swapping the roadmap moves the
defaults with it.

**Required weekly rate**, the month's version of §4.3's daily one:

> Spring Boot 12 / 40 hrs. 3 of 5 weeks left. Need 9.3 hrs/week. 4 behind pace.

Same pace marker as the week: where an even month would have you by now. When the month
can no longer reach a target, that is stated rather than implied by a rate nobody could
hit.

**Week-by-week breakdown.** Each target shows what every week of the month contributed.
Knowing you are twenty hours short says nothing about which week lost them.

**A month navigator.** Move between months to set next month's numbers before it starts
and review past ones after they end. A month reads as not started, running, or finished.

**Month shape** mirrors week shape: green/yellow/red day counts, month-over-month
comparison, and the tag-level totals.

**Milestones** from config with days remaining and status
(`upcoming | at risk | done | missed`). At risk = date within 7 days and the linked work
not started, or current weekly pace insufficient to reach it.

Each milestone carries a sub-checklist. The next three appear as a compact strip on Now.

### 4.5 Consistency grid

One cell per day, last 18 weeks, coloured by band. Hollow outline for a recovery day,
distinct marking for a placement-mode day. **A day spent in an interview is not a lapse in
discipline and must not render as one.**

No streak counter. Streaks create an incentive to lie to the tracker, which destroys the
only thing a tracker is for.

### 4.6 Placement mode

A per-day flag. Weekly targets re-pace across the remaining days instead of counting the
day as a hole, all drops default to `displaced`, and the grid marks it distinctly.

### 4.7 Settings

Deliberately small. Behaviour only — never the timetable, which is config.

- `nonNegotiableGate` — on/off (default on)
- `nonNegotiables` — editable list (default `['recall', 'log']`)
- `greenThreshold` (80) · `yellowThreshold` (55)
- `planningSlack` (85%)
- `dayEnd` (22:45) · `gymCutoffHour` (9)
- Week shape targets (4 / 2 / 1)
- Notification toggles, per notification type
- Export all to JSON · Import from JSON
- Manage saved day templates

---

## 5. Data model

```ts
days: {
  date: string;                  // 'YYYY-MM-DD', primary key
  anchorAt: number | null;
  template: string;              // TemplateId or saved-template id
  blocks: ScheduledBlock[];
  degradation: string[];
  pushes: { at: number; minutes: number }[];
  placementMode: boolean;
  score: number | null;          // computed at day close
  band: 'green' | 'yellow' | 'red' | null;
  gatePassed: boolean | null;
  plannedAt: number | null;      // null => unplanned => red
}

commitments: {
  id: string;
  dayDate: string;               // indexed
  blockId: string | null;
  label: string;
  targetType: 'count' | 'binary' | 'minutes';
  target: number;
  done: number;
  plannedMinutes: number;
  tags: string[];
  status: 'open' | 'complete' | 'partial' | 'skipped' | 'avoided' | 'displaced';
  displacedBy: string | null;
  movedCount: number;
  originDate: string;            // first date it was planned — drives movedCount
}

logs: {
  date: string;                  // primary key
  recallDrillDone: boolean;
  sleepHours: number;
  energy: 1 | 2 | 3 | 4 | 5;
  hardestThing: string;
  blocksContained: number;
  blocksTotal: number;
  createdAt: number;
}

savedTemplates: {
  id: string;
  name: string;                  // 'OA day', 'Interview day'
  blocks: BlockDef[];
  createdAt: number;
}

prefs: { key: string; value: unknown }
```

Config (timetable, subjects, milestones, weekly targets, rules) stays in
`schedule.config.ts` as typed constants — **not** in the database.

---

## 6. Engine contracts

Pure functions. No I/O, no `Date.now()` inside — pass the clock in. All unit-tested at
simulated dates.

```ts
layoutDay(anchor, template, windows): ScheduledBlock[]
degrade(template, availableMinutes, prefs): { blocks, cuts }
scoreDay(commitments, prefs): { score, band, gatePassed, failedGates }
checkFeasibility(commitments, availableMinutes, history, prefs): Verdict
weeklyPacing(days, commitments, targets, asOf): TargetPace[]
weekShape(days): { green, yellow, red, warning }
```

---

## 7. Notifications

`lib/notify.ts` — an interface with two runtime implementations:

```ts
interface Notifier {
  requestPermission(): Promise<boolean>;
  scheduleDay(blocks: ScheduledBlock[], prefs: Prefs): Promise<void>;
  cancelAll(): Promise<void>;
}
```

**`WebNotifier`** — service worker + `setTimeout`, re-armed on `visibilitychange`.
Honest limitation: unreliable when the browser is closed. Fine on the laptop during
study hours.

**`NativeNotifier`** — `@capacitor/local-notifications`, real `at` timestamps. Fires with
the app closed and the phone locked. This is the one that matters.

Call `scheduleDay()` at anchor and after any push, skip, or triage that moves boundaries.
Always `cancelAll()` first — duplicate notification stacks are the classic bug here.

```bash
npm i @capacitor/core @capacitor/cli @capacitor/local-notifications
npx cap init cadence com.dhurandhar.cadence --web-dir=dist
npm run build && npx cap add android && npx cap sync
npx cap open android    # Build > Build APK
```

Java 21 is already installed. Sideload the APK. No Play Store, no signing beyond a debug key.

---

## 8. Design direction

A **personal command centre**, read on one laptop, left open all day. Serious about the
numbers and calm about the reporting. The user should open it and answer, in this order:

> What am I doing? → How much have I done? → Am I on pace? → What comes next? → Am I improving?

That five-step hierarchy governs every screen.

**Palette** (Tailwind theme names — use these, never raw hex):

```
shell    #EAEFEB   the ground the app frame floats on
ink      #F7F9F7   page background, inside the frame
sunk     #F1F5F2   recessed sections, inset wells, chart tracks
panel    #FFFFFF   cards, raised surfaces
edge     #E4EAE6   borders, dividers, grid lines

text     #17221C   primary
soft     #66716A   secondary — descriptions, sub-labels
muted    #98A29C   tertiary — axis labels, placeholders

signal   #10B981   live / current / on pace — the one thing happening now
deep     #047857   green text on white, emphasis
mint     #34D399   chart fills, secondary series
wash     #ECFDF5   subtle green ground — selected nav, completed rows

pass     #10B981   green band, complete, contained
warn     #F59E0B   yellow band, at risk, pushed
fail     #EF4444   red band, overran, skipped, over-committed
info     #3B82F6   informational, never a judgement
```

Light only. Desktop only.

**The green rule.** Roughly **90% neutral to 10% green**. Green means completed, healthy,
on pace, or current focus — nothing else. If every heading, border and icon is green then
green has stopped meaning anything and the bands stop reading. This is the single easiest
thing to get wrong.

**Colour is never the only signal.** Every band, status and pace figure is paired with the
word for it. The red/yellow/green scoring is unchanged; it is simply drawn with less
aggression.

**Type:**
- Display and body — `Inter`, 400/500/600/700, tracking -0.02em on headings.
- Numerals — `IBM Plex Mono`, tabular figures. Every time, duration, countdown, percentage
  and rate. Monospace is reserved for **system metrics**; human content (task names,
  descriptions, navigation) is sans. That distinction is doing real work — keep it.

**Signature element — the Day Bar.** One horizontal band representing the anchored day end
to end, over an hour ruler. Each block is a segment sized by duration and coloured by
status, with commitment completion filling within the segment and a live marker at the
current position. At a glance: how much of the day is spent, how much was finished, how
much was lost.

**The frame.** The whole app sits in a rounded container inset from the window edge, on
the slightly deeper `shell` ground — an object on a desk rather than a page filling a
browser. Behind it, inside the frame, a contour layer: abstract topographic curves in
inline SVG at 5–7% opacity, top-right and bottom-left. Never an asset, never interactive,
never anything to actually look at. It gives the ground depth and nothing else.

**Surfaces.** Cards are white on `ink`, 1px `edge`, 18px radius, 20–24px padding, with a
shadow so faint it only separates what floats. Hierarchy comes from **borders and spacing**,
not from shadow. Inputs are 12px radius with a visible focus ring; buttons and status
pills are fully rounded, and every progress fill has round caps.

**Tinted tiles.** Headline metrics sit on soft tinted grounds rather than white cells, and
a tile only takes a tint when its number is saying something — amber when the day cannot
hold what is left, green when containment is perfect, neutral otherwise. A strip where
every tile is tinted is a strip where the tint means nothing: the green rule again, in
another costume.

**Hover.** Controls lift one pixel and warm their border on hover, over 200ms. Only
controls. A static card that moves under the cursor is a lie about what it does.

**Three states, everywhere.** Completed is green and quiet. Current is emphasised with an
emerald marker. Future is neutral grey. The same three read identically on Now, Day, Plan
and Progress.

**Motion.** 150–300ms for hover, buttons, checkboxes, card transitions; 300–500ms for
progress bars and charts arriving. Nothing loops, nothing animates in the background.
Respect `prefers-reduced-motion`.

**Copy.** Active voice, sentence case, no exclamation marks anywhere. Empty states give
direction (*"No plan for tomorrow. Two minutes now saves twenty in the morning."*). Failure
states state the fact and stay constructive: *"Needs attention — 3 days below target,
against a limit of 1"*, not *"3 RED DAYS"*. The app does not console, does not scold, and
does not shout. It answers "what should I do next?" rather than "you failed".

**Layout.** Desktop-first, and desktop-only. A 228px left sidebar — **Now · Day · Plan ·
Progress · Settings** — with a line icon and a soft green selected row; a short persistent
header; content capped at 1250px. Two- and three-column grids where the content earns
them, collapsing to one column below roughly 1100px. No horizontal scrolling at any width,
and no phone layout: there is no phone.

## 9. Build order

Six sessions. Each has a stopping condition. Do not proceed until it's met.

**Session 1 — Engine.**
Scaffold Vite/React/TS/Tailwind with §8 tokens. Drop in `schedule.config.ts`. Implement
`layout.ts` and `capacity.ts` with Vitest coverage: normal anchor, late anchor with
degradation, meal-window collision, past-window meal, lateNight template.
*Done when: tests pass. No UI yet.*

**Session 2 — Day mechanics.**
Dexie schema, day persistence, Start day flow, template picker, degradation confirm, live
countdown, containment prompts, push/skip. The Day Bar.
*Done when: a full day can be anchored, worked through, and every block marked, surviving
a refresh.*

**Session 3 — Commitments and scoring.**
Commitment CRUD, attach to blocks, tap-to-complete with partial credit, `scoring.ts` with
tests covering displacement, the gate, and all three bands. Burn-down. Live projected score.
Triage flow. Drop-reason picker.
*Done when: a planned day can be worked through and lands on the correct score, band, and
gate result — verified against hand-computed cases.*

**Session 4 — Plan and log.**
The evening flow. Log form with prefill. Tomorrow's plan with carry-overs, move-count
badges, roadmap-derived suggestions, `feasibility.ts` with tests.
*Done when: planning tomorrow takes under three minutes with a stopwatch, and tomorrow's
Now screen opens with those commitments in place.*

**Session 5 — Progress.**
`pacing.ts` with tests. Weekly targets with required daily rate, displacement debt, week
shape, consistency grid, milestones with at-risk logic, monthly view.
*Done when: two weeks of seeded data render correctly across all three horizons.*

**Session 6 — Custom days, Settings, PWA.**
Block builder with dnd-kit, saved templates, quick carve, placement mode. Settings screen
with all §4.7 keys wired. `vite-plugin-pwa`, manifest, icons, offline shell.
`WebNotifier`. JSON export/import. Deploy to Vercel.
*Done when: installable on the phone from the deployed URL, works in airplane mode, and
toggling `nonNegotiableGate` visibly changes a day's band.*


---

## 10. Explicitly out of scope for v1

DSA revision, spaced repetition, problem banks, pattern tracking — **all of it lives in a
separate app** · cloud sync · accounts · multiple users · a settings screen for the
timetable · gamification, points, badges · social or accountability partners ·
calendar *integration* (the month grid is a view of your own scored days, not a feed) ·
Pomodoro · dark mode · an Android build · a phone layout · an LLM coach · thesis or
GPU-job tracking · anything with the word "AI" in it

Some are reasonable for v2. None are worth missing Sunday for.

**The one reversal.** Streaks were on this list. A consistency run is now shown on
Progress → History, and it earns its place by counting something that costs you to break:
**consecutive days that cleared the red band**. An unplanned day is red by rule, so a gap
breaks it; a run of mediocre days cannot accumulate; and a placement day passes through
without counting either way (§4.6). It states its own rule on the card, sits at level 4 of
§8's hierarchy where it cannot compete with today, and has no fire, no badge, and no
"best ever" fanfare beyond a single line.

If a future change makes the run easier to hold, that change is wrong.
