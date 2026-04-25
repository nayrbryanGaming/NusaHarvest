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
        'nusa-green':  '#34d399',
        'nusa-teal':   '#14b8a6',
        'nusa-dark':   '#050b14',
        'nusa-darker': '#02050a',
        'nusa-card':   '#0a1628',
        'nusa-border': '#1e3a2f',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '3rem',
      },
      animation: {
        'pulse-slow':   'pulse 3s ease-in-out infinite',
        'pulse-slower': 'pulse 5s ease-in-out infinite',
        'spin-slow':    'spin 6s linear infinite',
        'float':        'float 5s ease-in-out infinite',
        'float-delayed': 'float 5s ease-in-out 1.5s infinite',
        'fade-in':      'fadeIn 0.4s ease-out both',
        'slide-up':     'slideUp 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.22,1,0.36,1) both',
        'glow-pulse':   'glowPulse 2.5s ease-in-out infinite',
        'shimmer':      'shimmer 1.8s ease-in-out infinite',
        'count-up':     'countUp 0.6s cubic-bezier(0.22,1,0.36,1) both',
        'ticker':       'ticker 25s linear infinite',
        'border-glow':  'borderGlow 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':       { transform: 'translateY(-8px)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(52,211,153,0.2)' },
          '50%':       { boxShadow: '0 0 28px rgba(52,211,153,0.45)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        countUp: {
          from: { opacity: '0', transform: 'translateY(10px) scale(0.9)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        ticker: {
          from: { transform: 'translateX(0)' },
          to:   { transform: 'translateX(-50%)' },
        },
        borderGlow: {
          '0%, 100%': { borderColor: 'rgba(52,211,153,0.15)' },
          '50%':       { borderColor: 'rgba(52,211,153,0.40)' },
        },
      },
      boxShadow: {
        'emerald-sm':  '0 0 12px rgba(52,211,153,0.2)',
        'emerald-md':  '0 0 24px rgba(52,211,153,0.3)',
        'emerald-lg':  '0 0 40px rgba(52,211,153,0.4)',
        'teal-sm':     '0 0 12px rgba(20,184,166,0.2)',
        'teal-md':     '0 0 24px rgba(20,184,166,0.3)',
        'amber-sm':    '0 0 12px rgba(251,191,36,0.2)',
        'amber-md':    '0 0 24px rgba(251,191,36,0.3)',
        'indigo-sm':   '0 0 12px rgba(99,102,241,0.2)',
        'glass':       '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        'glass-lg':    '0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        'card-hover':  '0 16px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(52,211,153,0.10)',
      },
      backgroundImage: {
        'grid-dark': "linear-gradient(to right,rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,0.025) 1px,transparent 1px)",
        'gradient-emerald': 'linear-gradient(135deg, #059669, #0d9488)',
        'gradient-gold':    'linear-gradient(135deg, #d97706, #f59e0b)',
        'gradient-indigo':  'linear-gradient(135deg, #4f46e5, #7c3aed)',
        'gradient-card':    'linear-gradient(135deg, rgba(10,22,40,0.8), rgba(5,11,20,0.9))',
      },
    },
  },
  plugins: [],
}
