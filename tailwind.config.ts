import type { Config } from 'tailwindcss';

// Themeable palette. Tokens resolve to CSS variables so light and dark are a
// single attribute flip on <html data-theme>, with no per-component class
// changes — that keeps the six feature branches from needing a re-rebase.
//
// Values are stored as bare "R G B" channel triples and wrapped in
// rgb(... / <alpha-value>) so Tailwind's opacity modifiers keep working
// (`text-muted/70`, `bg-cream/90`, and friends are used across the branches).
//
// `white` is overridden because ~50 card surfaces say `bg-white`; it resolves
// to the raised surface for the active theme.
const themed = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: themed('ground'),
        white: themed('surface'),
        shell: themed('shell'),
        blush: themed('blush'),
        rose: themed('rose'),
        ink: themed('ink'),
        muted: themed('muted'),
        hair: themed('hair'),
      },
      borderRadius: {
        pill: '999px',
      },
      boxShadow: {
        // Elevation differs by theme: a soft grey blur on light, a rim plus
        // depth on dark. Both live in globals.css.
        soft: 'var(--shadow-soft)',
        lift: 'var(--shadow-lift)',
      },
    },
  },
  plugins: [],
};

export default config;
