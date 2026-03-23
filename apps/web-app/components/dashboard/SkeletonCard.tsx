'use client';

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3 animate-pulse">
      <div className="h-4 w-3/4 rounded bg-panel" />
      <div className="h-4 w-1/2 rounded bg-panel" />
      <div className="h-9 w-36 rounded-lg bg-panel" />
    </div>
  );
}
