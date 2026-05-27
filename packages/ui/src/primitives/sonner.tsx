'use client';

import * as React from 'react';
import { Toaster as SonnerPrimitive, type ToasterProps as SonnerToasterProps } from 'sonner';

/**
 * Toaster — Sonner toast container, themed for Geist Design System.
 *
 * Per CURSOR.md §9 "Toast / Sonner", use Sonner for transient feedback
 * (copied-to-clipboard, action confirmations, errors). The `<Toaster />`
 * mounts once at the app root; trigger toasts anywhere via `import { toast }
 * from 'sonner'`.
 *
 * Defaults align with Geist DS:
 * - theme: dark (canonical — flip to "light" if your app opts in)
 * - position: bottom-right (less invasive than top-center)
 * - duration: 4000ms (Sonner default)
 *
 * Surface tokens are inherited from the global CSS — Sonner reads
 * `--popover` and `--popover-foreground` via its Tailwind selectors, which
 * @t2000/ui maps to `--ds-background-100` + `--fg` in `theme.css`.
 *
 * Re-export `toast` from 'sonner' for convenience:
 * ```tsx
 * import { Toaster, toast } from '@t2000/ui';
 * ```
 */
type ToasterProps = SonnerToasterProps;

function Toaster({ ...props }: ToasterProps) {
  return (
    <SonnerPrimitive
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-[var(--shadow-menu)]',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, type ToasterProps };
export { toast } from 'sonner';
