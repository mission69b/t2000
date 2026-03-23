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
      <div className="max-w-lg space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">
          A bank account that works for you.
        </h1>

        <p className="text-lg text-neutral-400 leading-relaxed">
          Earn yield on idle funds. Pay for services without accounts.
          Invest with one tap. All from your Google account.
        </p>

        <div className="space-y-3">
          <GoogleSignIn onClick={login} loading={isLoading} />
          <p className="text-sm text-neutral-500">
            No seed phrase. No keys. No downloads.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-8 text-sm text-neutral-500">
          <div>
            <p className="text-2xl font-bold text-white">41</p>
            <p>Services</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">90+</p>
            <p>Endpoints</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">0</p>
            <p>Fees to start</p>
          </div>
        </div>

        <p className="text-xs text-neutral-600 pt-4">
          Already use the CLI?{' '}
          <a
            href="https://www.npmjs.com/package/@t2000/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-white underline underline-offset-2"
          >
            npm install -g @t2000/cli
          </a>
        </p>
      </div>
    </main>
  );
}
