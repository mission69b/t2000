'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { LoadingScreen } from '@/components/auth/LoadingScreen';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { status, provingStep, error, handleCallback, login } = useZkLogin();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    handleCallback();
  }, [handleCallback]);

  useEffect(() => {
    if (status === 'authenticated') {
      const timer = setTimeout(() => router.replace('/dashboard'), 1200);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  return (
    <LoadingScreen
      step={provingStep}
      error={error}
      onRetry={login}
    />
  );
}
