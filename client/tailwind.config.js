/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: '#F5F7FC',
        surface: '#FFFFFF',
        line: { DEFAULT: '#E4E8F0', strong: '#CDD5E3' },
        ink: { DEFAULT: '#101828', 2: '#344054', 3: '#526076', 4: '#667085' },
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          500: '#5969E8',
          600: '#4656D6',
          700: '#3744B5',
          900: '#242E7A',
        },
        good: { DEFAULT: '#0F766E', bg: '#E9F8F5', line: '#BFE8DF' },
        warn: { DEFAULT: '#9A5B0A', bg: '#FFF7E8', line: '#F2D9A8' },
        bad: { DEFAULT: '#B42335', bg: '#FFF0F1', line: '#F5C9CF' },
        series: { 1: '#5969E8', 2: '#0F9F8F', 3: '#DB9238' },
      },
      boxShadow: {
        card: '0 1px 3px rgba(16, 24, 40, 0.05)',
        pop: '0 12px 32px rgba(30, 45, 90, 0.10), 0 2px 6px rgba(16, 24, 40, 0.05)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        tightish: '-0.011em',
      },
    },
  },
  plugins: [],
};
