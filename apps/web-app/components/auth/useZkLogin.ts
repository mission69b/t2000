'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import type { ZkLoginSession, ZkLoginStep } from '@/lib/zklogin';
import {
  loadSession,
  clearSession,
  startLogin,
  completeLogin,
  isSessionExpired,
  isSessionExpiringSoon,
} from '@/lib/zklogin';

export type ZkLoginStatus =
  | 'loading'       // checking localStorage for existing session
  | 'unauthenticated'
  | 'redirecting'   // heading to Google OAuth
  | 'proving'       // callback in progress (JWT → salt → ZK proof)
  | 'authenticated'
  | 'expired';

export interface UseZkLoginReturn {
  status: ZkLoginStatus;
  session: ZkLoginSession | null;
  address: string | null;
  /** Current step during proving phase (for loading screen) */
  provingStep: ZkLoginStep | null;
  /** Error message if login failed */
  error: string | null;
  /** Whether session expires within ~24h */
  expiringSoon: boolean;
  /** Initiate Google OAuth redirect */
  login: () => Promise<void>;
  /** Complete login from callback URL (called by auth/callback page) */
  handleCallback: () => Promise<void>;
  /** Clear session and return to unauthenticated */
  logout: () => void;
  /** Re-authenticate (clear + login) */
  refresh: () => Promise<void>;
}

export function useZkLogin(): UseZkLoginReturn {
  const client = useSuiClient();
  const [status, setStatus] = useState<ZkLoginStatus>('loading');
  const [session, setSession] = useState<ZkLoginSession | null>(null);
  const [provingStep, setProvingStep] = useState<ZkLoginStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);

  // On mount: check for existing session
  useEffect(() => {
    const existing = loadSession();
    if (existing) {
      setSession(existing);
      setStatus('authenticated');
    } else {
      setStatus('unauthenticated');
    }
  }, []);

  // Fetch current epoch for expiry checks
  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    client.getLatestSuiSystemState().then((state) => {
      if (!cancelled) {
        setCurrentEpoch(Number(state.epoch));
      }
    }).catch(() => { /* swallow — expiry check is best-effort */ });

    return () => { cancelled = true; };
  }, [client, status]);

  // Check if session is expired
  useEffect(() => {
    if (session && currentEpoch > 0 && isSessionExpired(session, currentEpoch)) {
      setStatus('expired');
    }
  }, [session, currentEpoch]);

  const expiringSoon = useMemo(() => {
    if (!session || currentEpoch === 0) return false;
    return isSessionExpiringSoon(session, currentEpoch);
  }, [session, currentEpoch]);

  const getCurrentEpoch = useCallback(async (): Promise<number> => {
    const state = await client.getLatestSuiSystemState();
    return Number(state.epoch);
  }, [client]);

  const login = useCallback(async () => {
    try {
      setError(null);
      setStatus('redirecting');
      await startLogin(getCurrentEpoch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login');
      setStatus('unauthenticated');
    }
  }, [getCurrentEpoch]);

  const handleCallback = useCallback(async () => {
    try {
      setError(null);
      setStatus('proving');
      const newSession = await completeLogin({
        onStep: setProvingStep,
      });
      setSession(newSession);
      setStatus('authenticated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setStatus('unauthenticated');
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setCurrentEpoch(0);
    setProvingStep(null);
    setError(null);
    setStatus('unauthenticated');
  }, []);

  const refresh = useCallback(async () => {
    logout();
    await login();
  }, [logout, login]);

  return {
    status,
    session,
    address: session?.address ?? null,
    provingStep,
    error,
    expiringSoon,
    login,
    handleCallback,
    logout,
    refresh,
  };
}
