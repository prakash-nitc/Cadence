/**
 * The icon set — SPEC §8.
 *
 * Hand-drawn rather than pulled from a library, because CLAUDE.md rule 5 holds and the
 * app needs about twenty glyphs, not two thousand. All share one 24-unit grid, 1.75
 * stroke, round caps, and `currentColor`, so an icon takes the colour of the text it sits
 * beside and never needs a colour prop of its own.
 *
 * Icons label; they do not carry meaning alone. Every status icon in the app sits next to
 * the word for that status — §12 is explicit that colour is never the only indication,
 * and the same reasoning applies to shape.
 */
import type { SVGProps } from 'react';

export type IconName =
  | 'now'
  | 'day'
  | 'plan'
  | 'progress'
  | 'settings'
  | 'check'
  | 'circle'
  | 'half'
  | 'skip'
  | 'clock'
  | 'calendar'
  | 'flag'
  | 'target'
  | 'bolt'
  | 'moon'
  | 'chart'
  | 'plus'
  | 'minus'
  | 'chevronRight'
  | 'chevronLeft'
  | 'bookmark'
  | 'sparkle'
  | 'download'
  | 'upload'
  | 'alert'
  | 'arrowUp'
  | 'arrowDown';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size on a 24 grid. Defaults to 16, the inline-with-text size. */
  size?: number;
}

/** Paths only — the wrapper supplies the grid, the stroke and the colour. */
const PATHS: Record<IconName, JSX.Element> = {
  now: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  day: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8.5 3.5V6.5M15.5 3.5V6.5" />
    </>
  ),
  plan: (
    <>
      <path d="M5 4.5h9.5L19 9v10.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" />
      <path d="M14 4.5V9h5M8.5 13.5h7M8.5 17h4.5" />
    </>
  ),
  progress: (
    <>
      <path d="M4 20V10M10 20V5M16 20v-7M22 20H2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19 7" />,
  circle: <circle cx="12" cy="12" r="8" />,
  half: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
    </>
  ),
  skip: <path d="M6 6l7 6-7 6M17 6v12" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8.5 3.5V6.5M15.5 3.5V6.5" />
    </>
  ),
  flag: <path d="M6 21V4.5M6 5h10.5l-2 3.5 2 3.5H6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  bolt: <path d="M13.5 2.5 5 13.5h6l-.5 8L19 10.5h-6l.5-8Z" />,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  chart: (
    <>
      <path d="M3.5 16.5 9 11l4 3.5 7.5-7.5" />
      <path d="M20.5 7v4.5M20.5 7H16" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  chevronRight: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  chevronLeft: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  bookmark: <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.5L5.5 20.5v-16a1 1 0 0 1 1-1Z" />,
  sparkle: <path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5L10.1 13 4.5 11l5.6-2L12 3.5Z" />,
  download: <path d="M12 3.5v12M7 11l5 5 5-5M4.5 20.5h15" />,
  upload: <path d="M12 20.5v-12M7 13l5-5 5 5M4.5 3.5h15" />,
  alert: (
    <>
      <path d="M12 3.5 21.5 20H2.5L12 3.5Z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.4" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  arrowUp: <path d="M12 19.5v-15M5.5 11 12 4.5 18.5 11" />,
  arrowDown: <path d="M12 4.5v15M5.5 13 12 19.5 18.5 13" />,
};

export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
