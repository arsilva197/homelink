/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Homelink brand palette
        brand: {
          50: '#fdfaf3',
          100: '#faf3de',
          200: '#f4e4b3',
          300: '#eccd7e',
          400: '#e2b049',
          500: '#d4941f',   // Primary amber
          600: '#b87515',
          700: '#935913',
          800: '#794717',
          900: '#673d18',
          950: '#3b1f09',
        },
        slate: {
          850: '#1a2235',
          950: '#0d1220',
        }
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        slideUp: {
          from: { opacity: 0, transform: 'translateY(16px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212, 148, 31, 0)' },
          '50%': { boxShadow: '0 0 20px 4px rgba(212, 148, 31, 0.3)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
