/**
 * Tailwind v3 preset for `@t2000/ui` consumers.
 *
 * Maps Geist Design System CSS custom properties (`--ds-*`, `--fg-*`,
 * `--t2k-accent`) into Tailwind v3 theme tokens so consumers can write
 * shadcn-idiomatic classes (`bg-background`, `text-foreground`,
 * `bg-card`, `text-muted-foreground`, `ring-ring`, etc.) and have them
 * resolve to Geist values automatically.
 *
 * Tailwind v3 consumers extend this preset in their own
 * `tailwind.config.ts`:
 *
 *   import t2000UiPreset from '@t2000/ui/tailwind-preset';
 *   export default { presets: [t2000UiPreset], content: [...] };
 *
 * Tailwind v4 consumers use `@t2000/ui/tokens/theme` instead (a CSS
 * @theme block that the v4 build picks up at runtime). See
 * packages/ui/README.md.
 */
const preset = {
  darkMode: ['class', '[data-theme="light"]'] as ['class', string],
  theme: {
    extend: {
      colors: {
        background: 'var(--ds-background-100)',
        foreground: 'var(--fg)',
        card: {
          DEFAULT: 'var(--bg-elevated)',
          foreground: 'var(--fg)',
        },
        popover: {
          DEFAULT: 'var(--bg-elevated)',
          foreground: 'var(--fg)',
        },
        primary: {
          DEFAULT: 'var(--ds-gray-1000)',
          foreground: 'var(--ds-background-100)',
        },
        secondary: {
          DEFAULT: 'var(--ds-gray-alpha-200)',
          foreground: 'var(--fg)',
        },
        muted: {
          DEFAULT: 'var(--ds-gray-alpha-200)',
          foreground: 'var(--fg-muted)',
        },
        accent: {
          DEFAULT: 'var(--t2k-accent)',
          foreground: '#ffffff',
        },
        destructive: {
          DEFAULT: 'var(--ds-red-800)',
          foreground: '#ffffff',
        },
        border: 'var(--ds-gray-alpha-400)',
        input: 'var(--ds-gray-alpha-400)',
        ring: 'var(--t2k-accent)',
      },
      ringOffsetColor: {
        background: 'var(--ds-background-100)',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0px' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0px' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s var(--ease-out)',
        'accordion-up': 'accordion-up 0.2s var(--ease-out)',
      },
    },
  },
};

export default preset;
