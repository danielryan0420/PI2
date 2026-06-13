/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        diamond: {
          dirt: '#a9714a',
          grass: '#2f7d32',
        },
      },
    },
  },
  plugins: [],
};
