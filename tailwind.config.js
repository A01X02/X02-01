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
        'primary-orange': '#DAA001',
        'primary-dark': '#A8800A',
        'light-orange': '#F7EDD0',
        'deep-orange': '#001DAA',
        'accent-blue': '#001DAA',
        'accent-blue-light': '#E5E9F7',
        'light-gray': '#EEF1F4',
        'white': '#FFFFFF',
        'dark-gray': '#1F2A37',
        'medium-gray': '#8B95A1',
        'bg-gray': '#F6F7F9',
      },
      boxShadow: {
        'gold-glow': '0 10px 34px rgba(218, 160, 1, 0.30)',
        'blue-glow': '0 10px 34px rgba(0, 29, 170, 0.16)',
        'soft': '0 8px 30px rgba(31, 42, 55, 0.10)',
      },
      backdropBlur: {
        xs: '4px',
        '3xl': '30px',
      },
      letterSpacing: {
        breath: '0.01em',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(218, 160, 1, 0)' },
          '50%': { boxShadow: '0 0 22px 2px rgba(218, 160, 1, 0.22)' },
        },
      },
      animation: {
        'glow-pulse': 'glow-pulse 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
