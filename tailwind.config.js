/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#16172b', soft: '#3a3b52', muted: '#6c6e88' },
        brand: { DEFAULT: '#4338ca', light: '#6366f1', dark: '#3730a3', wash: '#eef0ff' },
        owed: { DEFAULT: '#0f9d6e', wash: '#e7f7f0' },   // they owe you (positive)
        owe:  { DEFAULT: '#e11d48', wash: '#fdecf0' },    // you owe (negative)
        // Eidosyne brand identity (logo / splash only — NOT used for UI buttons,
        // which stay indigo, so it never clashes with the green "owed" money color)
        eidosyne: { DEFAULT: '#22c55e', ink: '#0c0d10' },
        canvas: '#f7f6f2',
        card: '#ffffff',
        line: '#ecebe6'
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(22,23,43,.04), 0 8px 24px -12px rgba(22,23,43,.12)',
        nav: '0 -1px 0 #ecebe6',
        sheet: '0 -12px 40px -8px rgba(22,23,43,.25)'
      },
      borderRadius: { xl2: '1.25rem' }
    }
  },
  plugins: []
};
