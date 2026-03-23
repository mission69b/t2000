'use client';

export function SkeletonCard() {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 space-y-3 animate-pulse">
      <div className="h-4 w-3/4 rounded bg-neutral-800" />
      <div className="h-4 w-1/2 rounded bg-neutral-800" />
      <div className="h-9 w-36 rounded-lg bg-neutral-800" />
    </div>
  );
}
