/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Dark only. No light mode — SPEC §8.
    extend: {
      colors: {
        ink: '#0E1116',    // page background
        panel: '#171B22',  // cards, raised surfaces
        edge: '#262C36',   // borders, dividers, grid lines
        text: '#E6E9EE',   // primary
        muted: '#8A94A3',  // labels, secondary
        signal: '#E8A33D', // live / now / active — ONE thing at a time
        pass: '#4FA97B',   // green band, complete, contained
        warn: '#D9A441',   // yellow band, at risk
        fail: '#C4553F',   // red band, overran, skipped, over-committed
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        display: '-0.02em',
        block: '0.08em',
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '2px',
        md: '4px',
        lg: '4px',   // nothing above 4px — SPEC §8
      },
    },
  },
  plugins: [],
};
