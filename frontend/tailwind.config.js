/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
        display: ['Georgia', '"Palatino Linotype"', '"Book Antiqua"', 'Palatino', 'serif'],
        mono: ['ui-monospace', '"JetBrains Mono"', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dbe4fe',
          200: '#bfcffc',
          300: '#93aef9',
          400: '#6686f4',
          500: '#4361ee',
          600: '#2d41e2',
          700: '#2533cf',
          800: '#232da8',
          900: '#1a2259',
        },
      },
    },
  },
  plugins: [],
}
