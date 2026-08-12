import type { Config } from 'tailwindcss';

// Dark by default. The palette keeps the Glossier character (warm, soft, blush
// accents) but inverts the ground: a warm near-black page with light type.
//
// Deliberately implemented as token VALUES only, with no per-component class
// changes, so the six feature branches do not have to be re-rebased for a
// palette swap. Two consequences worth knowing:
//
//   `white`  is overridden, because ~50 card surfaces across the branches say
//            `bg-white`. It now resolves to the raised surface colour.
//   `rose`   is the deep accent used for backgrounds/borders (light type sits
//            on it). Accent *text* needs the lighter tint instead, so
//            `.text-rose` / `.decoration-rose` are overridden in globals.css.
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#131010',   // page ground (dark)
        white: '#1B1717',   // raised card surface (see note above)
        shell: '#241F1E',   // product beds, inset fills
        blush: '#30211F',   // accent wash
        rose: '#7E443A',    // accent background / border
        ink: '#F3EEEA',     // primary foreground (light)
        muted: '#9C918B',   // secondary foreground
        hair: '#2C2624',    // hairline dividers
      },
      borderRadius: {
        pill: '999px',
      },
      boxShadow: {
        // On a dark ground, elevation reads through a hairline rim plus depth,
        // not a soft grey blur.
        soft: '0 1px 2px rgba(0, 0, 0, 0.5), 0 10px 28px -14px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(243, 238, 234, 0.045)',
        lift: '0 2px 6px rgba(0, 0, 0, 0.55), 0 22px 48px -20px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(243, 238, 234, 0.07)',
      },
    },
  },
  plugins: [],
};

export default config;
