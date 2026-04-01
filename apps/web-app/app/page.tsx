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
            <span className="font-mono font-semibold text-foreground tracking-tight text-lg uppercase">Audric</span>
            <span className="text-[9px] uppercase tracking-widest font-medium text-muted border border-border rounded px-1.5 py-0.5 leading-none">
              beta
            </span>
          </div>

          <h1 className="text-2xl font-display tracking-tight text-foreground">
            Your money, handled.
          </h1>

          <p className="text-sm text-muted leading-relaxed">
            Earn yield automatically. Pay for anything with AI. Zero gas fees.
          </p>
        </div>

        <div className="space-y-3">
          <GoogleSignIn onClick={login} loading={isLoading} />
          <p className="text-xs text-dim font-mono">
            No seed phrase. No keys. No downloads.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center gap-4 text-xs text-dim font-mono">
            <a href="https://audric.ai/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition">
              Privacy
            </a>
            <span>·</span>
            <a href="https://audric.ai/terms" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition">
              Terms
            </a>
            <span>·</span>
            <a href="https://audric.ai/disclaimer" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition">
              Disclaimer
            </a>
          </div>
          <a href="https://t2000.ai" target="_blank" rel="noopener noreferrer" className="text-[10px] text-dim/60 font-mono hover:text-dim transition">
            Built with t2000
          </a>
        </div>
      </div>
    </main>
  );
}
