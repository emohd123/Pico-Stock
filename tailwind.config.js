/** @type {import('tailwindcss').Config} */
module.exports = {
  // Only scan source dirs (NOT the 8k-line globals.css world). Utilities are opt-in.
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  // CRITICAL: disable Tailwind's base reset so it does NOT clobber the existing
  // hand-written globals.css. We only want utilities for new sections.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // Pico brand tokens — must match globals.css :root exactly (accuracy).
        pico: {
          teal: '#00A5A5',
          'teal-light': '#00C9C9',
          'teal-dark': '#008585',
          ink: '#0a0e14',      // near-black surface used across the dark UI
          card: '#10151d',     // card surface on dark sections
          grey: '#6B7280',
          'grey-light': '#9CA3AF',
        },
      },
      boxShadow: {
        'teal': '0 4px 20px rgba(0,165,165,0.15)',
        'teal-lg': '0 8px 40px rgba(0,165,165,0.22)',
      },
      borderRadius: {
        'card': '20px',
      },
    },
  },
  plugins: [],
};
