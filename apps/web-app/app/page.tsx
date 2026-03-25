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
    <main className="flex flex-1 flex-col items-center px-6 text-center">
      <div className="flex flex-col items-center max-w-xl w-full pt-16 pb-16 space-y-12">
        {/* Hero */}
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-accent rounded-full shadow-[0_0_8px_var(--accent)]" />
            <span className="font-mono font-semibold text-accent tracking-tight text-lg">t2000</span>
          </div>

          <h1 className="text-2xl font-mono font-semibold tracking-tight text-foreground">
            A bank account that works for you.
          </h1>

          <div className="space-y-1.5 text-sm text-muted">
            <p>Your money earns 6-8% while you sleep.</p>
            <p>Pay for any service — no accounts, no subscriptions.</p>
            <p>Buy, sell, and swap crypto with one tap.</p>
          </div>
        </div>

        {/* How it works */}
        <div className="w-full space-y-3 text-sm">
          {[
            { step: '1', label: 'Sign in with Google' },
            { step: '2', label: 'Add funds' },
            { step: '3', label: "That's it." },
          ].map((item) => (
            <div key={item.step} className="flex items-center gap-4 border border-border bg-surface/40 px-4 py-3">
              <span className="font-mono text-accent text-lg font-semibold">{item.step}</span>
              <span className="text-muted font-mono">{item.label}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <GoogleSignIn onClick={login} loading={isLoading} />
          <p className="text-xs text-dim font-mono">
            No seed phrase. No keys. No downloads.
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-stretch gap-3 text-xs w-full">
          <div className="flex-1 border border-border bg-surface/40 px-4 py-3">
            <p className="text-lg font-semibold text-foreground font-mono">41</p>
            <p className="text-muted uppercase tracking-wider font-mono text-[10px]">Services</p>
          </div>
          <div className="flex-1 border border-border bg-surface/40 px-4 py-3">
            <p className="text-lg font-semibold text-foreground font-mono">90+</p>
            <p className="text-muted uppercase tracking-wider font-mono text-[10px]">Endpoints</p>
          </div>
          <div className="flex-1 border border-border bg-surface/40 px-4 py-3">
            <p className="text-lg font-semibold text-foreground font-mono">0</p>
            <p className="text-muted uppercase tracking-wider font-mono text-[10px]">Fees to start</p>
          </div>
        </div>

        {/* Footer */}
        <div className="space-y-4">
          <p className="text-xs text-dim font-mono">
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

          <div className="flex items-center justify-center gap-4 text-xs text-dim font-mono">
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
      </div>
    </main>
  );
}
