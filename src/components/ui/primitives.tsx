/**
 * The shared surface, metric and control primitives — SPEC §8.
 *
 * Everything visual in the app is built from these, so a spacing or radius decision is
 * made once here rather than re-chosen in thirty components. CLAUDE.md rule 6 still
 * holds: theme token names only, no raw hex, no arbitrary values.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type Tone = 'neutral' | 'pass' | 'warn' | 'fail' | 'signal' | 'info';

/**
 * Tone is always paired with a word in the interface — §12. These are the paint, not the
 * meaning: nothing in the app tells the user something using colour alone.
 */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-text',
  pass: 'text-deep',
  warn: 'text-warn',
  fail: 'text-fail',
  signal: 'text-deep',
  info: 'text-info',
};

export const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-muted',
  pass: 'bg-pass',
  warn: 'bg-warn',
  fail: 'bg-fail',
  signal: 'bg-signal',
  info: 'bg-info',
};

const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-sunk text-soft',
  pass: 'bg-wash text-deep',
  warn: 'bg-warn/10 text-warn',
  fail: 'bg-fail/10 text-fail',
  signal: 'bg-wash text-deep',
  info: 'bg-info/10 text-info',
};

/** The standard white card. `flush` drops the padding for tables and inset lists. */
export function Card({
  children,
  className = '',
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return <div className={`card ${flush ? '' : 'p-5'} ${className}`}>{children}</div>;
}

/**
 * A titled card. The eyebrow sits inside the border here rather than above it, because a
 * section with its own actions needs them on the same row as the title.
 */
export function Panel({
  title,
  icon,
  action,
  children,
  className = '',
}: {
  title: string;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          {icon ? <Icon name={icon} size={15} className="text-muted" /> : null}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A small square icon chip, as on the reference dashboard's stat tiles. */
export function IconChip({ name, tone = 'neutral' }: { name: IconName; tone?: Tone }) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${TONE_SOFT[tone]}`}
    >
      <Icon name={name} size={16} />
    </span>
  );
}

/**
 * One number and what it means — §13, §17. The number is the content; the label is the
 * caption. Sizes are fixed here so a row of tiles never has ragged numerals.
 */
export function Stat({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      {icon ? (
        <div className="mb-3">
          <IconChip name={icon} tone={tone} />
        </div>
      ) : null}
      <p className={`font-mono text-2xl font-semibold leading-none ${TONE_TEXT[tone]}`}>{value}</p>
      <p className="mt-1.5 text-xs text-soft">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

/**
 * A horizontal progress bar.
 *
 * `marker` draws a thin rule at a second position — where you *should* be, against where
 * you are. That comparison is the whole point of a pace bar, and without it a bar at 60%
 * says nothing about whether 60% is good.
 */
export function Bar({
  value,
  tone = 'pass',
  marker,
  height = 'h-2',
  animate = true,
}: {
  value: number;
  tone?: Tone;
  marker?: number | null;
  height?: string;
  animate?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const at = marker === null || marker === undefined ? null : Math.max(0, Math.min(1, marker)) * 100;

  return (
    <div className={`relative w-full overflow-hidden rounded-sm bg-sunk ${height}`}>
      <div
        className={`h-full rounded-sm ${TONE_FILL[tone]} ${animate ? 'origin-left animate-draw-bar' : ''} transition-[width] duration-500`}
        style={{ width: `${pct}%` }}
      />
      {at === null ? null : (
        <span
          className="absolute inset-y-0 w-px bg-text/35"
          style={{ left: `${at}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/**
 * The headline percentage as a ring — §24. Reads at a glance from across a desk, which a
 * bar does not. Used once per screen at most; a wall of rings is just a bar chart that
 * takes more space.
 */
export function Ring({
  value,
  label,
  caption,
  tone = 'pass',
  size = 152,
}: {
  value: number | null;
  label?: string;
  caption?: string;
  tone?: Tone;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value));
  const strokeClass = {
    neutral: 'stroke-muted',
    pass: 'stroke-pass',
    warn: 'stroke-warn',
    fail: 'stroke-fail',
    signal: 'stroke-signal',
    info: 'stroke-info',
  }[tone];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fill-none stroke-sunk"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`fill-none ${strokeClass} transition-[stroke-dashoffset] duration-700`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono text-3xl font-semibold leading-none ${TONE_TEXT[tone]}`}>
          {value === null ? '—' : `${Math.round(pct * 100)}%`}
        </span>
        {label ? (
          <span className="mt-1 text-[11px] uppercase tracking-block text-muted">{label}</span>
        ) : null}
        {caption ? <span className="mt-0.5 text-xs text-soft">{caption}</span> : null}
      </div>
    </div>
  );
}

/** A status word on a tinted ground. Always the word, never the colour alone. */
export function Pill({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium ${TONE_SOFT[tone]}`}
    >
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  // Green ground, used for the one dominant action on a screen and nowhere else — §34.
  primary: 'border-signal bg-wash text-deep hover:bg-mint/25',
  secondary: 'border-edge bg-panel text-text hover:border-muted hover:bg-sunk',
  ghost: 'border-transparent bg-transparent text-soft hover:bg-sunk hover:text-text',
  danger: 'border-fail/40 bg-panel text-fail hover:bg-fail/10',
};

export function Button({
  children,
  variant = 'secondary',
  icon,
  size = 'md',
  className = '',
  ...rest
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const pad = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
    lg: 'px-4 py-3 text-sm font-medium',
  }[size];

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${pad} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 13 : 15} /> : null}
      {children}
    </button>
  );
}

/** A label above a group of cards. Sits outside the border, unlike `Panel`'s title. */
export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

/** What to do when there is nothing here yet — §39. Direction, never consolation. */
export function Empty({
  title,
  body,
  action,
  icon = 'calendar',
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-edge bg-panel px-6 py-10 text-center">
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sunk text-muted">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-soft">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
