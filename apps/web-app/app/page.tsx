'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleSignIn } from '@/components/auth/GoogleSignIn';
import { useZkLogin } from '@/components/auth/useZkLogin';

export default function LandingPage() {
  const router = useRouter();
  const { status, login } = useZkLogin();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  const isLoading = status === 'redirecting' || status === 'loading';

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="flex flex-col items-center max-w-md w-full space-y-10">
        <div className="space-y-5">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-accent rounded-full shadow-[0_0_8px_var(--accent)]" />
            <span className="font-mono font-semibold text-accent tracking-tight text-lg">t2000</span>
            <span className="text-[9px] uppercase tracking-widest font-medium text-muted border border-border rounded px-1.5 py-0.5 leading-none">
              beta
            </span>
          </div>

          <h1 className="text-2xl font-mono font-semibold tracking-tight text-foreground">
            A bank account that works for you.
          </h1>

          <p className="text-sm text-muted leading-relaxed">
            Earn yield. Pay for services. Swap crypto. All in one place.
          </p>
        </div>

        <div className="space-y-3">
          <GoogleSignIn onClick={login} loading={isLoading} />
          <p className="text-xs text-dim font-mono">
            No seed phrase. No keys. No downloads.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-dim font-mono">
          <a href="https://t2000.ai/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition">
            Privacy
          </a>
          <span>·</span>
          <a href="https://t2000.ai/terms" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition">
            Terms
          </a>
        </div>
      </div>
    </main>
  );
}
