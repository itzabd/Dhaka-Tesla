import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary:         '#c2652a',
        'primary-dark':  '#a8541f',
        surface:         '#faf9f6',
        'surface-alt':   '#efece6',
        card:            '#ffffff',
        ink:             '#18181b',
        'ink-muted':     '#71717a',
        success:         '#16a34a',
        'success-dark':  '#15803d',
        warning:         '#d97706',
        'warning-dark':  '#b45309',
        danger:          '#dc2626',
        'danger-dark':   '#b91c1c',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans:  ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
