/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./game/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['Outfit', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        abyss: {
          950: '#02090f',
          900: '#04121f',
          800: '#071c2e',
          700: '#0a2740',
          600: '#0e3552',
          500: '#134666',
        },
        glow: {
          cyan: '#4fc3f7',
          aqua: '#26c6da',
          coral: '#ff6b9d',
          pearl: '#ffd54f',
          jelly: '#7e57c2',
          star: '#ffab40',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.75rem',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        'glow-sm': '0 0 12px rgba(79, 195, 247, 0.35)',
        'glow-md': '0 0 28px rgba(79, 195, 247, 0.35)',
        'glow-lg': '0 0 60px rgba(79, 195, 247, 0.28)',
      },
      keyframes: {
        'rise': {
          '0%': { transform: 'translate3d(0, 12vh, 0) scale(0.4)', opacity: '0' },
          '12%': { opacity: '0.5' },
          '85%': { opacity: '0.35' },
          '100%': { transform: 'translate3d(0, -108vh, 0) scale(1)', opacity: '0' },
        },
        'caustic': {
          '0%, 100%': { transform: 'translate3d(-4%, 0, 0) scale(1.05)', opacity: '0.35' },
          '50%': { transform: 'translate3d(4%, 2%, 0) scale(1.15)', opacity: '0.6' },
        },
        'sway': {
          '0%, 100%': { transform: 'translateY(0) rotate(-1.5deg)' },
          '50%': { transform: 'translateY(-10px) rotate(1.5deg)' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.85) translateY(12px)', opacity: '0' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        'shimmer-sweep': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.75)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'drift': {
          '0%': { transform: 'translateX(-8%)' },
          '50%': { transform: 'translateX(8%)' },
          '100%': { transform: 'translateX(-8%)' },
        },
      },
      animation: {
        rise: 'rise linear infinite',
        caustic: 'caustic 14s ease-in-out infinite',
        sway: 'sway 5s ease-in-out infinite',
        'pop-in': 'pop-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'shimmer-sweep': 'shimmer-sweep 2.6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.4s ease-out infinite',
        drift: 'drift 18s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
