import type { Config } from 'tailwindcss';

/** Colours resolve to CSS variables (see styles/index.css) so the dark theme is a pure
 *  variable swap; the `<alpha-value>` placeholder keeps `/10`-style opacity modifiers working. */
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: token('primary'),
        'on-primary': token('on-primary'),
        ink: token('ink'),
        muted: token('muted'),
        border: token('border'),
        surface: token('surface'),
        card: token('card'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
      },
      borderRadius: {
        card: '14px',
        control: '10px',
      },
    },
  },
  plugins: [],
} satisfies Config;
