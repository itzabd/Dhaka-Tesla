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
        surface:         '#faf5ee',
        'surface-alt':   '#f6f0e8',
        card:            '#ffffff',
        ink:             '#18181b',
        'ink-muted':     '#3a302a',
        success:         '#2a874e',
        'success-dark':  '#205c36',
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
