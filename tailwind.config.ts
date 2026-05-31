import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta base (spec sección 6.2). `primary` se sobreescribe por tienda
        // vía la variable CSS --color-primary (definida en globals.css o inline).
        primary: 'var(--color-primary, #1E5FA8)',
        background: '#F8F9FA',
        card: '#FFFFFF',
        'text-main': '#1A1A2E',
        'text-muted': '#6B7280',
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
      },
      borderRadius: {
        card: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
};
export default config;
