/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./script.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['Courier New', 'monospace'],
      },
      colors: {
        primary: '#00ff88',
        secondary: '#00cc6a',
        dark: '#0a0a0a',
        surface: '#121212',
        'surface-light': '#1e1e1e',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
        'glitch': 'glitch 1s linear infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  darkMode: 'class',
};
