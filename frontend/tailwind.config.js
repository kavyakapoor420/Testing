/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1021',
        ocean: '#0e7490',
        foam: '#ecfeff',
        ember: '#f97316'
      }
    }
  },
  plugins: []
}
