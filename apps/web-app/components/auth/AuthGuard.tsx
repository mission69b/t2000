'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from './useZkLogin';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Wraps authenticated pages. Redirects to landing if user has no session.
 * Shows a minimal loading state while checking localStorage.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { status } = useZkLogin();

  useEffect(() => {
    if (status === 'unauthenticated' || status === 'expired') {
      router.replace('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </main>
    );
  }

  if (status === 'unauthenticated' || status === 'expired') {
    return null;
  }

  return <>{children}</>;
}
