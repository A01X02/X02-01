/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'primary-orange': '#E8A87C',
        'dark-gray': '#2C3E50',
        'light-orange': '#F5D5C0',
        'light-gray': '#ECF0F1',
        'white': '#FFFFFF',
        'deep-orange': '#D4845A',
        'medium-gray': '#95A5A6',
        'bg-gray': '#F5F5F5',
      },
    },
  },
  plugins: [],
}
