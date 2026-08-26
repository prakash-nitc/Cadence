/**
 * schedule.config.ts
 *
 * The Build Phase roadmap, encoded as data. This file is the single source of truth
 * for the timetable — editing the schedule means editing this file and committing,
 * not clicking through a settings screen.
 *
 * NOTE ON TIMES: block definitions carry DURATIONS, never clock times. Actual clock
 * times are computed at runtime from the day's anchor by engine/layout.ts.
 * The only wall-clock facts in this file are the mess windows, because the mess
 * does not care when you woke up.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockKind = 'work' | 'break' | 'meal' | 'routine';
export type Priority = 0 | 1 | 2 | 3; // 0 = protected, 3 = fixed. See SPEC §2.4
export type TemplateId = 'full' | 'lateNight' | 'saturday' | 'sunday' | 'recovery';

export interface BlockDef {
  id: string;
  label: string;
  detail?: string;
  minutes: number;
  minMinutes?: number;   // compressible floor; absent = not compressible
  kind: BlockKind;
  priority: Priority;
  window?: string;       // FixedWindow id, meals only
  /**
   * Drops from auto-scheduling when the anchor lands later than `gymCutoffHour`
   * (Settings). Config names which block is cutoff-sensitive; Settings decides when.
   */
  cutoffSensitive?: boolean;
}

export interface FixedWindow {
  id: string;
  opensAt: string;  // 'HH:mm'
  closesAt: string;
}

// ─── Mess windows ─────────────────────────────────────────────────────────────

export const FIXED_WINDOWS: FixedWindow[] = [
  { id: 'breakfast', opensAt: '07:00', closesAt: '09:00' },
  { id: 'lunch',     opensAt: '13:00', closesAt: '14:00' },
  { id: 'dinner',    opensAt: '20:00', closesAt: '21:00' },
];

// ─── Templates ────────────────────────────────────────────────────────────────

/**
 * The standard weekday. ~9h 30m of focused work, deliberately below the 13.5h
 * sprint pace — this one has to still be running on 15 November.
 */
export const FULL_DAY: BlockDef[] = [
  { id: 'wake',       label: 'Wake',              detail: 'Water. No phone. Phone stays out of the room overnight.', minutes: 15, kind: 'routine', priority: 3 },
  { id: 'gym',        label: 'Gym',               detail: 'Infrastructure, not optional. Regulating, not training.',  minutes: 35, kind: 'routine', priority: 3, cutoffSensitive: true },
  { id: 'ready',      label: 'Shower, get ready', minutes: 40, kind: 'routine', priority: 3 },
  { id: 'breakfast',  label: 'Breakfast',         detail: 'Go early, skip the queue.', minutes: 30, kind: 'meal', priority: 3, window: 'breakfast' },

  { id: 'recall',     label: 'Recall drill',      detail: 'Runs in the DSA tracker app. Logged here as done / not done.', minutes: 20, kind: 'work', priority: 0 },
  { id: 'dsa_deep',   label: 'DSA deep block',    detail: 'Peak cognition. New patterns — Trees, then Graphs, then DP. 3–4 problems.', minutes: 180, minMinutes: 90, kind: 'work', priority: 0 },
  { id: 'break_1',    label: 'Break',             detail: 'Outside. Water. No screen.', minutes: 15, kind: 'break', priority: 2 },

  { id: 'spring_1',   label: 'Spring Boot — part 1', minutes: 100, minMinutes: 60, kind: 'work', priority: 0 },
  { id: 'lunch',      label: 'Lunch + walk',      detail: 'Do not skip the walk.', minutes: 60, kind: 'meal', priority: 3, window: 'lunch' },
  { id: 'spring_2',   label: 'Spring Boot — part 2', detail: 'Same task, continuous with the morning.', minutes: 80, minMinutes: 60, kind: 'work', priority: 0 },

  { id: 'tea',        label: 'Tea',               detail: 'Outdoors. Phone-free.', minutes: 20, kind: 'break', priority: 2 },
  { id: 'sequential', label: 'Sequential track',  detail: 'One subject at a time. Read → write from memory → say it out loud → two follow-ups → 10 MCQs.', minutes: 120, minMinutes: 60, kind: 'work', priority: 1 },
  { id: 'break_2',    label: 'Break',             minutes: 20, kind: 'break', priority: 2 },

  { id: 'flex',       label: 'Flex',              detail: 'Pattern repair, cold re-solves, aptitude, thesis, or catch-up.', minutes: 90, kind: 'work', priority: 2 },
  { id: 'break_3',    label: 'Decompress',        minutes: 30, kind: 'break', priority: 2 },
  { id: 'dinner',     label: 'Dinner',            detail: 'Talk to people. Call home.', minutes: 60, kind: 'meal', priority: 3, window: 'dinner' },

  { id: 'dsa_second', label: 'Second DSA pass',   detail: 'One cold re-solve, or the pattern-trigger drill (Tue/Fri).', minutes: 40, kind: 'work', priority: 2 },
  { id: 'log',        label: 'Daily log',         detail: 'Log today. Plan tomorrow’s commitments. Under three minutes.', minutes: 20, minMinutes: 10, kind: 'work', priority: 0 },
  { id: 'winddown',   label: 'Wind down',         detail: 'Book. No screens.', minutes: 45, minMinutes: 20, kind: 'routine', priority: 1 },
];

/**
 * Anchor after ~16:00. Rule 1 still holds — DSA before anything else *today*,
 * whatever hour "first" turns out to be. Gym is gone, flex is gone, the log survives.
 */
export const LATE_NIGHT: BlockDef[] = [
  { id: 'recall',     label: 'Recall drill',      minutes: 20, kind: 'work', priority: 0 },
  { id: 'dsa_deep',   label: 'DSA deep block',    detail: 'Reduced. Two problems, done properly.', minutes: 120, minMinutes: 90, kind: 'work', priority: 0 },
  { id: 'break_1',    label: 'Break',             minutes: 15, kind: 'break', priority: 2 },
  { id: 'spring_1',   label: 'Spring Boot',       minutes: 120, minMinutes: 60, kind: 'work', priority: 0 },
  { id: 'dinner',     label: 'Dinner',            minutes: 45, kind: 'meal', priority: 3, window: 'dinner' },
  { id: 'sequential', label: 'Sequential track',  minutes: 60, minMinutes: 45, kind: 'work', priority: 1 },
  { id: 'log',        label: 'Daily log',         minutes: 15, minMinutes: 10, kind: 'work', priority: 0 },
  { id: 'winddown',   label: 'Wind down',         minutes: 20, kind: 'routine', priority: 1 },
];

export const SATURDAY: BlockDef[] = [
  { id: 'wake',       label: 'Wake',              minutes: 15, kind: 'routine', priority: 3 },
  { id: 'gym',        label: 'Gym',               detail: 'Full body, or a longer walk. Keep it light.', minutes: 35, kind: 'routine', priority: 3, cutoffSensitive: true },
  { id: 'ready',      label: 'Get ready',         minutes: 40, kind: 'routine', priority: 3 },
  { id: 'breakfast',  label: 'Breakfast',         minutes: 30, kind: 'meal', priority: 3, window: 'breakfast' },
  { id: 'recall',     label: 'Recall drill',      minutes: 20, kind: 'work', priority: 0 },
  { id: 'mixed_set',  label: 'Mixed set',         detail: '3 untagged problems, 75 minutes, timed. No hints on which pattern.', minutes: 75, kind: 'work', priority: 0 },
  { id: 'break_1',    label: 'Break',             minutes: 20, kind: 'break', priority: 2 },
  { id: 'lunch',      label: 'Lunch',             minutes: 60, kind: 'meal', priority: 3, window: 'lunch' },
  { id: 'project',    label: 'Project deep work', detail: 'PaperTrail. Four hours, uninterrupted.', minutes: 240, minMinutes: 150, kind: 'work', priority: 0 },
  { id: 'rest',       label: 'Rest / social / thesis overflow', minutes: 120, kind: 'break', priority: 2 },
  { id: 'dinner',     label: 'Dinner',            minutes: 60, kind: 'meal', priority: 3, window: 'dinner' },
  { id: 'log',        label: 'Daily log',         minutes: 20, minMinutes: 10, kind: 'work', priority: 0 },
];

export const SUNDAY: BlockDef[] = [
  { id: 'wake',       label: 'Wake',              detail: 'Same wake time as weekdays. A late Saturday costs you Monday morning.', minutes: 15, kind: 'routine', priority: 3 },
  { id: 'ready',      label: 'Get ready',         minutes: 40, kind: 'routine', priority: 3 },
  { id: 'breakfast',  label: 'Breakfast',         minutes: 30, kind: 'meal', priority: 3, window: 'breakfast' },
  { id: 'review_dsa', label: 'Weekly review + pattern repair', minutes: 120, minMinutes: 90, kind: 'work', priority: 0 },
  { id: 'lunch',      label: 'Lunch',             minutes: 60, kind: 'meal', priority: 3, window: 'lunch' },
  { id: 'rest',       label: 'Rest',              detail: 'Genuinely off.', minutes: 300, kind: 'break', priority: 3 },
  { id: 'dinner',     label: 'Dinner',            minutes: 60, kind: 'meal', priority: 3, window: 'dinner' },
  { id: 'plan_week',  label: 'Sunday review',     detail: 'Numbers against targets. Spring Boot hours. What shipped. Next week’s top three.', minutes: 45, minMinutes: 30, kind: 'work', priority: 0 },
];

/** Sick, travelling, thesis emergency. Honest, not a failure. Three in a week is a warning. */
export const RECOVERY: BlockDef[] = [
  { id: 'recall',     label: 'Recall drill',      detail: 'The cheapest habit in the plan. This is the last thing cut, not the first.', minutes: 20, kind: 'work', priority: 0 },
  { id: 'dsa_one',    label: 'One DSA problem',   detail: 'Even on a bad day. One problem before anything else.', minutes: 45, kind: 'work', priority: 0 },
  { id: 'log',        label: 'Daily log',         minutes: 15, minMinutes: 10, kind: 'work', priority: 0 },
];

export const TEMPLATES: Record<TemplateId, BlockDef[]> = {
  full: FULL_DAY,
  lateNight: LATE_NIGHT,
  saturday: SATURDAY,
  sunday: SUNDAY,
  recovery: RECOVERY,
};

/** Default template by weekday (0 = Sunday). Overridable at Start day. */
export const DEFAULT_TEMPLATE_BY_DAY: TemplateId[] = [
  'sunday', 'full', 'full', 'full', 'full', 'full', 'saturday',
];

/** If the anchor lands after this hour, suggest lateNight instead of the default. */
export const LATE_NIGHT_THRESHOLD_HOUR = 16;

/** Soft end of day. Capacity is measured from anchor to here. User-editable in prefs. */
export const DAY_END_DEFAULT = '22:45';

/** Gym drops from auto-scheduling if the anchor is later than this. */
export const GYM_CUTOFF_HOUR = 9;

// ─── Weekly targets ───────────────────────────────────────────────────────────

export interface WeeklyTarget {
  id: string;
  label: string;
  min: number;
  max?: number;
  unit: string;
  warnBelow?: number;   // renders red below this, distinct from simply "not yet hit"
  warnCopy?: string;
  note?: string;
}

export const WEEKLY_TARGETS: WeeklyTarget[] = [
  { id: 'dsa_new',      label: 'New DSA problems',     min: 16, max: 20, unit: 'problems', note: '3–4 weekday + Saturday mixed set' },
  { id: 'recall',       label: 'Recall drills',        min: 5,  max: 5,  unit: 'days',     note: 'Non-negotiable. Cheapest habit in the plan. Drill lives in the DSA app.' },
  { id: 'cold_resolve', label: 'Cold re-solves',       min: 5,  max: 7,  unit: 'problems', note: 'One per weekday evening' },
  { id: 'spring_hours', label: 'Spring Boot hours',    min: 15, unit: 'hours', warnBelow: 12, warnCopy: 'Early warning, not a blip.', note: 'The number to protect.' },
  { id: 'spring_commits', label: 'Spring Boot commits', min: 4, max: 6,  unit: 'commits',  note: 'Not one giant commit on Sunday' },
  { id: 'sequential',   label: 'Sequential track hours', min: 8, unit: 'hours' },
  { id: 'gym',          label: 'Gym sessions',         min: 5,  max: 6,  unit: 'sessions' },
  { id: 'sleep',        label: 'Nights at 7h+',        min: 7,  max: 7,  unit: 'nights',   note: 'Non-negotiable' },
];

// ─── Sequential track ─────────────────────────────────────────────────────────

export interface Subject {
  order: number;
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  days: number;
  mode: 'new' | 'revision' | 'practice';
  topics: string[];
  sources: string;
}

export const SEQUENTIAL_TRACK: Subject[] = [
  {
    order: 1, id: 'sql', label: 'SQL', startDate: '2026-08-25', endDate: '2026-09-05',
    days: 10, mode: 'practice',
    topics: [
      'SELECT / WHERE', 'All JOIN types', 'GROUP BY / HAVING',
      'Subqueries and correlated subqueries',
      'Window functions — RANK, DENSE_RANK, ROW_NUMBER, LAG/LEAD', 'CTEs',
    ],
    sources: 'LeetCode Database in order. Target 50–60 problems. Window functions are the differentiator — most candidates stop at JOINs.',
  },
  {
    order: 2, id: 'dbms', label: 'DBMS', startDate: '2026-09-08', endDate: '2026-09-12',
    days: 5, mode: 'revision',
    topics: [
      'Normalisation', 'ACID', 'Isolation levels', 'Indexing and B+ trees',
      'Transactions', 'Concurrency control and 2PL', 'Query optimisation', 'ER modelling',
    ],
    sources: 'GATE notes + Striver or Gate Smashers. Two topics per day. Connect every topic back to a SQL query you wrote last week.',
  },
  {
    order: 3, id: 'oop', label: 'OOP + Java internals', startDate: '2026-09-15', endDate: '2026-09-25',
    days: 9, mode: 'new',
    topics: [
      'HashMap internals — hashing, collision, resize, treeify', 'JVM and GC',
      'String pool', '== vs equals', 'hashCode contract',
      'volatile vs synchronized', 'ExecutorService',
      'SOLID — one principle at a time, with a violation and its fix in Java',
    ],
    sources: 'The one core subject that is genuinely new rather than revision. VISA and Oracle probe this directly.',
  },
  {
    order: 4, id: 'os', label: 'Operating Systems', startDate: '2026-09-28', endDate: '2026-10-02',
    days: 5, mode: 'revision',
    topics: [
      'Process vs thread', 'IPC', 'Synchronisation primitives', 'Deadlock',
      'CPU scheduling', 'Memory management and virtual memory', 'File systems',
    ],
    sources: 'You own the numericals from CIL. What you need now is articulation.',
  },
  {
    order: 5, id: 'cn', label: 'Computer Networks', startDate: '2026-10-06', endDate: '2026-10-10',
    days: 5, mode: 'revision',
    topics: [
      'OSI vs TCP/IP', 'TCP vs UDP', 'Three-way handshake', 'Congestion control',
      'IP addressing and subnetting', 'DNS resolution flow', 'HTTPS and TLS handshake',
    ],
    sources: 'Connect directly to the Spring Boot REST work.',
  },
  {
    order: 6, id: 'lld', label: 'LLD', startDate: '2026-10-13', endDate: '2026-11-03',
    days: 16, mode: 'new',
    topics: [
      'Singleton — and why the naive version is broken', 'Factory', 'Builder',
      'Strategy', 'Observer', 'Adapter', 'Decorator',
      'Parking Lot', 'BookMyShow', 'Splitwise', 'Elevator', 'Rate Limiter', 'Tic-Tac-Toe',
    ],
    sources: 'Striver LLD series. Find each pattern inside Spring. Requirements → class diagram on paper → identify patterns → code the core classes. Never read a solution before attempting.',
  },
];

/**
 * Friday maintenance: last 45 minutes of Friday's sequential block go to one COMPLETED
 * subject — notes reread, two topics articulated out loud. The app picks longest-untouched.
 */
export const FRIDAY_MAINTENANCE_MINUTES = 45;

// ─── DSA track ────────────────────────────────────────────────────────────────

export const DSA_TOPICS = [
  {
    id: 'trees', label: 'Trees', target: 18, of: 31,
    approach: 'Traversals (all four, recursive and iterative) → depth/diameter → path sum → validation and BST → construction from traversals → LCA. Skip redundant variants.',
  },
  {
    id: 'graphs', label: 'Graphs', target: 14, of: 20,
    approach: 'Representation → BFS/DFS templates → cycle detection → topological sort → grid BFS and Number of Islands → Dijkstra → Union-Find. Grid problems appear in OAs far more often than Bellman-Ford.',
  },
  {
    id: 'dp', label: 'DP', target: 16, of: 3,
    approach: 'Striver’s series. 1D templates → 0/1 knapsack → LIS → LCS → grid DP → stocks. The bar is easy DP done reliably, not hard DP.',
  },
];

// ─── Spring Boot track ────────────────────────────────────────────────────────

export const SPRING_PHASES = [
  { startDate: '2026-08-25', endDate: '2026-08-31', label: 'Foundations',
    detail: 'Telusko selective: Spring intro, Spring REST with Boot. Java 21, IntelliJ, PostgreSQL, Postman set up. A 3-endpoint in-memory REST API. Baeldung on IoC/DI and stereotype annotations.' },
  { startDate: '2026-09-01', endDate: '2026-09-07', label: 'Notes API — solo',
    detail: 'Complete CRUD Notes API from scratch, zero AI-generated code. Two entities, PostgreSQL, three-layer architecture, DTOs, @ControllerAdvice. This week is where understanding is built — do not outsource it.' },
  { startDate: '2026-09-08', endDate: '2026-09-21', label: 'PaperTrail core',
    detail: 'Design on paper first, no AI. Entities: User, Paper, Tag, Note. Repositories, service layer, controllers, pagination. AI for boilerplate only; you write every service method.' },
  { startDate: '2026-09-22', endDate: '2026-09-28', label: 'Auth + validation',
    detail: 'Spring Security + JWT. Write the JWT filter yourself. @Valid, custom exceptions, consistent error responses, role-based access.' },
  { startDate: '2026-09-29', endDate: '2026-10-12', label: 'Test, Docker, deploy',
    detail: 'JUnit + Mockito on the service layer — 40% coverage is fine. Swagger. Multi-stage Dockerfile. docker-compose. Deploy to Render. README with architecture diagram.' },
  { startDate: '2026-10-13', endDate: '2026-10-19', label: 'Defense doc',
    detail: 'The 30-question interview defense document. Every answer practised out loud. This artifact converts a project into interview performance, and almost nobody writes it.' },
];

// ─── Milestones ───────────────────────────────────────────────────────────────

export interface Milestone {
  date: string;
  label: string;
  critical?: boolean;
}

export const MILESTONES: Milestone[] = [
  { date: '2026-08-27', label: 'Damage assessment complete. Per-pattern failure rate recorded.', critical: true },
  { date: '2026-08-31', label: 'Spring Boot environment working. First REST API running locally.' },
  { date: '2026-09-05', label: 'SQL complete — 50–60 LeetCode Database problems including window functions.' },
  { date: '2026-09-07', label: 'Notes API complete, built solo, zero AI-generated code.' },
  { date: '2026-09-12', label: 'DBMS complete. Trees complete (~18). Pattern repair finished.' },
  { date: '2026-09-25', label: 'OOP + Java internals complete. PaperTrail core CRUD working, Graphs underway.' },
  { date: '2026-10-02', label: 'OS complete. PaperTrail auth working — JWT flow explainable with no notes.' },
  { date: '2026-10-10', label: 'CN complete. All five core subjects done. Graphs complete.', critical: true },
  { date: '2026-10-12', label: 'PaperTrail deployed. Live URL. README done. Resume updated. LLD starts.', critical: true },
  { date: '2026-10-19', label: 'Defense doc written and rehearsed out loud. DP underway.' },
  { date: '2026-10-26', label: 'DP complete. Off-campus applications going out.' },
  { date: '2026-11-03', label: 'LLD complete — 6+ classic problems designed and coded. All tracks finished.', critical: true },
  { date: '2026-11-30', label: 'Semiconductor prep (C/C++, COA) done. Mock interviews running weekly.' },
  { date: '2026-12-31', label: 'CGPA crosses 7.0. Ready when on-campus eligibility opens.', critical: true },
];

export const PHASES = [
  { id: 1, label: 'Repair & Foundations', startDate: '2026-08-25', endDate: '2026-09-21' },
  { id: 2, label: 'Ship',                 startDate: '2026-09-22', endDate: '2026-10-26' },
  { id: 3, label: 'Depth',                startDate: '2026-10-27', endDate: '2026-11-30' },
  { id: 4, label: 'Eligible',             startDate: '2026-12-01', endDate: '2026-12-31' },
];

// ─── Gym rotation ─────────────────────────────────────────────────────────────

export const GYM_ROTATION: Record<number, string> = {
  0: 'Off, or a walk. Genuinely rest.',
  1: 'Upper push — dumbbell press, shoulder press, overhead extension. 3 sets each.',
  2: 'Cardio — 20 min treadmill intervals or cycle, then core.',
  3: 'Upper pull — dumbbell rows, curls, rear delt raises.',
  4: 'Cardio — steady 25 min, easy pace. Recovery day.',
  5: 'Legs — goblet squats, lunges, calf raises, Romanian deadlifts.',
  6: 'Full body, or a longer walk outdoors. Keep it light.',
};

// ─── Scoring defaults ─────────────────────────────────────────────────────────

/**
 * These seed the Settings store on first run. After that, Settings wins — the app
 * reads prefs, never these constants. They live here only so a fresh install starts
 * calibrated to the Build Phase rather than to nothing.
 */
export const DEFAULT_PREFS = {
  /** Non-negotiables scored pass/fail, separately from the percentage. */
  nonNegotiableGate: true,

  /**
   * Commitment tags or block ids that must be completed for a day to be green.
   * User-editable. This list belongs to the current roadmap, not to the app.
   */
  nonNegotiables: ['recall', 'log'] as string[],

  greenThreshold: 80,
  yellowThreshold: 55,

  /** Plan to this share of available time. The slack IS the plan. */
  planningSlack: 0.85,

  dayEnd: DAY_END_DEFAULT,
  gymCutoffHour: GYM_CUTOFF_HOUR,

  /** Week shape targets. Three yellows is the early warning, not the failure. */
  weekShape: { minGreen: 4, maxYellow: 2, maxRed: 1 },

  /** Days of history before the feasibility check starts quoting the user's own numbers. */
  historyWindowDays: 14,

  /** Carry-over moves allowed before the do-it-or-delete prompt. */
  maxCarryOverMoves: 3,

  notifications: {
    blockStart: true,
    fiveMinuteWarning: true,
    blockEnd: true,
    middayPace: true,
    burnDownNegative: true,
    planAndLog: true,
    screensOff: true,
    notAnchored: true,
  },
};

/** Why a commitment was dropped. Displaced leaves scoring; the other two do not. */
export const DISPLACEMENT_REASONS = [
  { id: 'oa',        label: 'Online assessment' },
  { id: 'interview', label: 'Interview' },
  { id: 'placement', label: 'Placement activity' },
  { id: 'thesis',    label: 'Thesis deadline' },
  { id: 'academic',  label: 'Coursework / exam' },
  { id: 'health',    label: 'Health' },
  { id: 'family',    label: 'Family' },
  { id: 'travel',    label: 'Travel' },
];

// ─── Commitment presets ───────────────────────────────────────────────────────

/**
 * Seeds the nightly plan step so planning is editing, not composing. Targets are
 * defaults the user overrides; `tags` drive weekly pacing and the gate.
 */
export interface CommitmentPreset {
  blockId: string;
  label: string;
  targetType: 'count' | 'binary' | 'minutes';
  target: number;
  tags: string[];
  /** Pull the label from the roadmap instead of using the literal above. */
  derive?: 'sequentialSubject' | 'springPhase' | 'dsaTopic';
}

export const COMMITMENT_PRESETS: CommitmentPreset[] = [
  { blockId: 'recall',     label: 'Recall drill',        targetType: 'binary',  target: 1,  tags: ['recall'] },
  { blockId: 'dsa_deep',   label: 'DSA problems',        targetType: 'count',   target: 4,  tags: ['dsa'], derive: 'dsaTopic' },
  { blockId: 'spring_1',   label: 'Spring Boot',         targetType: 'minutes', target: 100, tags: ['spring'], derive: 'springPhase' },
  { blockId: 'spring_2',   label: 'Spring Boot',         targetType: 'minutes', target: 80, tags: ['spring'], derive: 'springPhase' },
  { blockId: 'sequential', label: 'Sequential track',    targetType: 'minutes', target: 120, tags: ['sequential'], derive: 'sequentialSubject' },
  { blockId: 'dsa_second', label: 'Cold re-solve',       targetType: 'count',   target: 1,  tags: ['dsa'] },
  { blockId: 'flex',       label: 'Flex',                targetType: 'minutes', target: 90, tags: ['flex'] },
  { blockId: 'log',        label: 'Log and plan',        targetType: 'binary',  target: 1,  tags: ['log'] },
  { blockId: 'mixed_set',  label: 'Mixed set — 3 untagged, timed', targetType: 'count', target: 3, tags: ['dsa'] },
  { blockId: 'project',    label: 'PaperTrail',          targetType: 'minutes', target: 240, tags: ['spring'], derive: 'springPhase' },
];

/**
 * NOTE: DSA revision — spaced repetition, pattern tracking, recognition drills — lives
 * in a separate app. The recall block stays in this timetable as a container and is
 * logged here as done/not-done only. Do not rebuild it in this app.
 */

// ─── Rules ────────────────────────────────────────────────────────────────────

/** One shown on the Now screen each day, rotating. Not decoration — these are the spec. */
export const RULES: string[] = [
  'DSA first thing, every day. Even on a bad day, one problem before anything else.',
  'Spring Boot is protected. It does not get sacrificed to a good DSA day, an interesting paper, or a company announcement.',
  'Revision is the last thing cut, not the first. On a bad day, cut new problems and keep the 20-minute recall.',
  'Hard block boundaries. A failed block ends at the block boundary — no doubling up, no cascading.',
  'Company-specific prep only after clearing the first gate. Never stop core prep for a company that has not shortlisted you.',
  'AI explains and reviews, never builds. If you cannot whiteboard it cold, you do not own it.',
  'Every core CS topic gets said out loud. Knowing is not articulating, and the round tests the second one.',
  'Seven hours of sleep. Non-negotiable. Interviewers can see exhaustion.',
  'Planning is not progress. Adding detail to a plan instead of executing one is avoidance in a productive costume.',
  'Track honestly. A missed day is marked missed, not half-done. Lying to the tracker only removes your ability to correct.',
];
