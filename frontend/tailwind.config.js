/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['"IBM Plex Sans"', 'sans-serif'],
      },
      colors: {
        base:    '#09090B',
        surface: '#111113',
        raised:  '#18181B',
        border:  '#27272A',
        amber: {
          DEFAULT: '#F59E0B',
          dim:     '#92400E',
          glow:    'rgba(245,158,11,0.12)',
        },
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease forwards',
        'slide-in':   'slideIn 0.25s ease forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 },              to: { opacity: 1 } },
        slideIn: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
