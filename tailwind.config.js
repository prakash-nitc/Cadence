/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Light, warm-neutral. Desktop only — SPEC §8.
    extend: {
      colors: {
        // Surfaces, lightest-sitting-on-darkest last.
        shell: '#EAEFEB', // the ground the app frame floats on
        ink: '#F7F9F7', // page background, inside the frame
        sunk: '#F1F5F2', // recessed sections, table headers, inset wells
        panel: '#FFFFFF', // cards, raised surfaces
        edge: '#E4EAE6', // borders, dividers, grid lines

        // Type. Three weights of voice, not three shades picked by eye.
        text: '#17221C', // primary
        soft: '#66716A', // secondary — descriptions, sub-labels
        muted: '#98A29C', // tertiary — axis labels, placeholders, disabled

        /*
         * Green carries every positive state: current, complete, on pace. §34 puts the
         * ratio at roughly 90% neutral to 10% green — if every heading and border is
         * green then green has stopped meaning anything, and the bands stop reading.
         */
        signal: '#10B981', // live / current / on pace — the one thing happening now
        deep: '#047857', // emphasis on green ground, green text on white
        mint: '#34D399', // light green — chart fills, secondary series
        wash: '#ECFDF5', // very subtle green ground — selected nav, completed rows

        pass: '#10B981', // green band, complete, contained
        warn: '#F59E0B', // yellow band, at risk, pushed
        fail: '#EF4444', // red band, overran, skipped, over-committed
        info: '#3B82F6', // neutral-informational, never a judgement
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        display: '-0.02em',
        block: '0.08em',
      },
      borderRadius: {
        DEFAULT: '12px',
        sm: '6px', // dots, chips, small marks
        md: '12px', // inputs, inner surfaces
        lg: '18px', // the standard card
        xl: '24px', // the app frame
      },
      boxShadow: {
        // Hierarchy comes from borders and spacing; shadow only lifts what floats.
        card: '0 1px 3px rgba(23, 34, 28, 0.05)',
        lift: '0 4px 14px rgba(23, 34, 28, 0.08)',
        // The frame reads as an object on a desk rather than a page in a window.
        frame: '0 1px 2px rgba(23, 34, 28, 0.04), 0 8px 32px rgba(23, 34, 28, 0.06)',
        focus: '0 0 0 3px rgba(16, 185, 129, 0.18)',
      },
      transitionDuration: {
        DEFAULT: '180ms',
      },
      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pop-check': {
          '0%': { transform: 'scale(0.7)', opacity: '0.4' },
          '60%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'draw-bar': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 260ms ease-out both',
        'pop-check': 'pop-check 240ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'draw-bar': 'draw-bar 420ms ease-out both',
      },
    },
  },
  plugins: [],
};
