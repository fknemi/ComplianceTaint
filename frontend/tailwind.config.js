/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        surface: '#1e293b',
        border: '#334155',
        'text-primary': '#f8fafc',
        'text-secondary': '#94a3b8',
        accent: '#f97316',
        'accent-blue': '#64748b',
        'accent-light': '#93c5fd',
        critical: '#7c2d12',
        'critical-text': '#fdba74',
        safe: '#1e3a5f',
        'safe-text': '#93c5fd'
      }
    },
  },
  plugins: [],
}