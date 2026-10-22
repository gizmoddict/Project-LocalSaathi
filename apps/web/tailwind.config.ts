import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', '"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        brand: {
          forest: '#173b2f',
          forestDark: '#0f271f',
          forestLight: '#245944',
          mint: '#28734f',
          gold: '#c58b48',
          goldLight: '#e2bd80',
          sand: '#f7f8f5',
          cream: '#f1eee5',
        },
        saathi: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(40, 115, 79, 0.3)',
        card: '0 12px 36px -8px rgba(23, 59, 47, 0.08), 0 4px 12px -2px rgba(23, 59, 47, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
