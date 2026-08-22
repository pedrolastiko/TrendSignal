import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0F172A',
        ink: '#111827',
        muted: '#6B7280',
        border: '#E5E7EB',
        surface: '#F8FAFC',
        success: '#059669',
        warning: '#D97706',
        danger: '#DC2626',
      },
      borderRadius: {
        card: '14px',
        control: '10px',
      },
    },
  },
  plugins: [],
} satisfies Config;
