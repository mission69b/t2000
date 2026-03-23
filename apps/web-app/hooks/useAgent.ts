'use client';

import { useMemo } from 'react';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { deserializeKeypair } from '@/lib/zklogin';

/**
 * Provides a lazy-loaded T2000 agent from the current zkLogin session.
 *
 * Call `agent.getInstance()` to get the full T2000 instance on demand.
 * Uses dynamic import to keep the initial bundle small — the SDK is only
 * loaded when the user triggers an action.
 */
export function useAgent() {
  const { session, status } = useZkLogin();

  const agent = useMemo(() => {
    if (!session || status !== 'authenticated') return null;

    return {
      session,
      address: session.address,
      async getInstance() {
        const { T2000 } = await import('@t2000/sdk');
        const ephemeralKeypair = deserializeKeypair(session.ephemeralKeyPair);

        return T2000.fromZkLogin({
          ephemeralKeypair,
          zkProof: session.proof,
          userAddress: session.address,
          maxEpoch: session.maxEpoch,
        });
      },
    };
  }, [session, status]);

  return {
    agent,
    loading: status === 'loading',
    authenticated: status === 'authenticated',
    address: session?.address ?? null,
  };
}
