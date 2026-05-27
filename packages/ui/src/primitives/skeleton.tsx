import * as React from 'react';
import { cn } from '../lib/cn.js';

/**
 * Skeleton — loading placeholder.
 *
 * Per CURSOR.md §9 "Skeleton states", use during loading rather than spinners
 * for content that has a known shape. Geist token: surface is
 * `--ds-gray-alpha-100` (matches the `bg-muted` Tailwind alias).
 *
 * The pulse animation comes from Tailwind's built-in `animate-pulse`.
 * Honors `prefers-reduced-motion` via UA default (Tailwind's keyframes
 * are wrapped in a media query that suppresses motion when requested).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
