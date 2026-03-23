'use client';

import { useEffect, useState } from 'react';
import type { ZkLoginStep } from '@/lib/zklogin';

interface LoadingScreenProps {
  step: ZkLoginStep | null;
  error: string | null;
  onRetry?: () => void;
}

const STEPS: { key: ZkLoginStep; label: string }[] = [
  { key: 'jwt', label: 'Account created' },
  { key: 'salt', label: 'Address generated' },
  { key: 'proof', label: 'Securing your account' },
];

function stepIndex(step: ZkLoginStep | null): number {
  if (!step) return -1;
  if (step === 'done') return STEPS.length;
  return STEPS.findIndex((s) => s.key === step);
}

export function LoadingScreen({ step, error, onRetry }: LoadingScreenProps) {
  const currentIdx = stepIndex(step);
  const isDone = step === 'done';
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => setShowDone(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isDone]);

  const progress = Math.min(((currentIdx + 1) / STEPS.length) * 100, 100);

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="bg-accent px-6 py-3 font-semibold text-background tracking-[0.05em] uppercase transition hover:bg-accent/90 hover:bg-[#00f0a0] hover:shadow-[0_0_20px_var(--accent-glow)]"
            >
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  if (showDone) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="space-y-4 text-center animate-in fade-in duration-300">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-dim">
            <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-foreground">You&apos;re all set!</h2>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <h2 className="text-xl font-semibold text-center text-foreground">
          Creating your account...
        </h2>

        <div className="space-y-4">
          {STEPS.map((s, i) => {
            const isComplete = currentIdx > i;
            const isActive = currentIdx === i;

            return (
              <div key={s.key} className="flex items-center gap-3">
                {isComplete ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-dim">
                    <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="h-6 w-6 flex items-center justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-dim" />
                  </div>
                )}
                <span className={isComplete || isActive ? 'text-foreground' : 'text-muted'}>
                  {s.label}{isActive ? '...' : ''}
                </span>
              </div>
            );
          })}
        </div>

        <div className="h-1.5 w-full rounded-full bg-panel overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </main>
  );
}
