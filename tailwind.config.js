/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  /*
   * `dark:` follows the app's own switch, not the operating system — the user chooses in
   * Settings, and "Match Windows" is one of the choices. Almost everything themes through
   * the token variables alone; `dark:` is for the few marks that need a different shade,
   * not just a different value, to stay visible on a dark ground.
   */
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    /*
     * Warm-neutral, in a light and a dark set — SPEC §8.
     *
     * Every colour is a CSS variable holding an RGB triplet, defined in index.css for
     * each theme. Components use the token names only (CLAUDE.md rule 6), so swapping
     * the variables re-themes the whole app, and `bg-signal/80` style opacity still works.
     * The values for both themes live in src/index.css.
     */
    extend: {
      colors: {
        // Surfaces, lightest-sitting-on-darkest last.
        shell: 'rgb(var(--c-shell) / <alpha-value>)', // the ground the app frame floats on
        ink: 'rgb(var(--c-ink) / <alpha-value>)', // page background, inside the frame
        sunk: 'rgb(var(--c-sunk) / <alpha-value>)', // recessed sections, table headers, inset wells
        panel: 'rgb(var(--c-panel) / <alpha-value>)', // cards, raised surfaces
        edge: 'rgb(var(--c-edge) / <alpha-value>)', // borders, dividers, grid lines

        // Type. Three weights of voice, not three shades picked by eye.
        text: 'rgb(var(--c-text) / <alpha-value>)', // primary
        soft: 'rgb(var(--c-soft) / <alpha-value>)', // secondary — descriptions, sub-labels
        muted: 'rgb(var(--c-muted) / <alpha-value>)', // tertiary — axis labels, placeholders, disabled

        /*
         * Green carries every positive state: current, complete, on pace. §34 puts the
         * ratio at roughly 90% neutral to 10% green — if every heading and border is
         * green then green has stopped meaning anything, and the bands stop reading.
         */
        signal: 'rgb(var(--c-signal) / <alpha-value>)', // live / current / on pace — the one thing happening now
        deep: 'rgb(var(--c-deep) / <alpha-value>)', // emphasis on green ground, green text on white
        mint: 'rgb(var(--c-mint) / <alpha-value>)', // light green — chart fills, secondary series
        wash: 'rgb(var(--c-wash) / <alpha-value>)', // very subtle green ground — selected nav, completed rows

        pass: 'rgb(var(--c-pass) / <alpha-value>)', // green band, complete, contained
        warn: 'rgb(var(--c-warn) / <alpha-value>)', // yellow band, at risk, pushed
        fail: 'rgb(var(--c-fail) / <alpha-value>)', // red band, overran, skipped, over-committed
        info: 'rgb(var(--c-info) / <alpha-value>)', // neutral-informational, never a judgement

        /*
         * Categorical — the area split on Progress, and nowhere else. They mean "a
         * different kind of work", never a state, so none of them is amber or red.
         */
        cat1: 'rgb(var(--c-cat1) / <alpha-value>)', // green
        cat2: 'rgb(var(--c-cat2) / <alpha-value>)', // blue
        cat3: 'rgb(var(--c-cat3) / <alpha-value>)', // violet
        cat4: 'rgb(var(--c-cat4) / <alpha-value>)', // cyan
        cat5: 'rgb(var(--c-cat5) / <alpha-value>)', // pink
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
        card: '0 1px 3px rgb(var(--c-shadow) / 0.05)',
        lift: '0 4px 14px rgb(var(--c-shadow) / 0.08)',
        // The frame reads as an object on a desk rather than a page in a window.
        frame: '0 1px 2px rgb(var(--c-shadow) / 0.04), 0 8px 32px rgb(var(--c-shadow) / 0.06)',
        focus: '0 0 0 3px rgb(var(--c-signal) / 0.18)',
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
        /* One block closing. Fires once per block, never per checkbox. */
        settle: {
          '0%': { transform: 'scale(1)' },
          '35%': { transform: 'scale(1.012)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 260ms ease-out both',
        'pop-check': 'pop-check 240ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'draw-bar': 'draw-bar 420ms ease-out both',
        settle: 'settle 320ms cubic-bezier(0.34, 1.4, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};
