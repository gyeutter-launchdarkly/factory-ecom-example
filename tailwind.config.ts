import type { Config } from 'tailwindcss';

// Glossier-inspired palette: warm off-white ground, blush accents, soft ink.
// Named tokens keep the six feature branches from drifting into ad-hoc hexes.
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FDFBF9',   // page ground
        shell: '#F6F1ED',   // product image beds, subtle fills
        blush: '#F7DED8',   // primary accent wash
        rose: '#E9A79B',    // accent line / hover
        ink: '#1A1817',     // text + CTA
        muted: '#8C837D',   // secondary text
        hair: '#EAE3DD',    // hairline dividers
      },
      borderRadius: {
        pill: '999px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26, 24, 23, 0.04), 0 8px 24px -12px rgba(26, 24, 23, 0.10)',
        lift: '0 2px 4px rgba(26, 24, 23, 0.05), 0 16px 40px -16px rgba(26, 24, 23, 0.16)',
      },
    },
  },
  plugins: [],
};

export default config;
