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
      <div className="max-w-xl space-y-8">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          A bank account that works for you.
        </h1>

        <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">
          Earn yield on idle funds. Pay for services without accounts.
          Invest with one tap. All from your Google account.
        </p>

        <div className="space-y-3">
          <GoogleSignIn onClick={login} loading={isLoading} />
          <p className="text-xs text-dim">
            No seed phrase. No keys. No downloads.
          </p>
        </div>

        <div className="flex items-stretch gap-3 pt-4 text-xs">
          <div className="flex-1 border border-border rounded-lg bg-surface/40 px-4 py-3">
            <p className="text-lg font-semibold text-foreground font-mono">41</p>
            <p className="text-muted">Services</p>
          </div>
          <div className="flex-1 border border-border rounded-lg bg-surface/40 px-4 py-3">
            <p className="text-lg font-semibold text-foreground font-mono">90+</p>
            <p className="text-muted">Endpoints</p>
          </div>
          <div className="flex-1 border border-border rounded-lg bg-surface/40 px-4 py-3">
            <p className="text-lg font-semibold text-foreground font-mono">0</p>
            <p className="text-muted">Fees to start</p>
          </div>
        </div>

        <p className="text-xs text-dim pt-2">
          Already use the CLI?{' '}
          <a
            href="https://www.npmjs.com/package/@t2000/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline underline-offset-2"
          >
            npm install -g @t2000/cli
          </a>
        </p>

        <div className="flex items-center justify-center gap-4 pt-1 text-xs text-dim">
          <a href="https://t2000.ai/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition">
            Privacy
          </a>
          <span>·</span>
          <a href="https://t2000.ai/terms" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition">
            Terms
          </a>
          <span>·</span>
          <a href="https://t2000.ai/security" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition">
            Security
          </a>
        </div>
      </div>
    </main>
  );
}
