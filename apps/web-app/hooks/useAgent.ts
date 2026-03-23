'use client';

import { useMemo } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { deserializeKeypair } from '@/lib/zklogin';

export interface AgentActions {
  address: string;
  send(params: { to: string; amount: number; asset?: string }): Promise<{ tx: string }>;
  save(params: { amount: number }): Promise<{ tx: string }>;
  withdraw(params: { amount: number }): Promise<{ tx: string }>;
  borrow(params: { amount: number }): Promise<{ tx: string }>;
  repay(params: { amount: number }): Promise<{ tx: string }>;
}

export function useAgent() {
  const { session, status } = useZkLogin();
  const suiClient = useSuiClient();

  const agent = useMemo((): { address: string; getInstance: () => Promise<AgentActions> } | null => {
    if (!session || status !== 'authenticated') return null;

    return {
      address: session.address,
      async getInstance(): Promise<AgentActions> {
        const { ZkLoginSigner } = await import('@t2000/sdk/browser');
        const { toBase64 } = await import('@t2000/sdk/browser');

        const ephemeralKeypair = deserializeKeypair(session.ephemeralKeyPair);
        const signer = new ZkLoginSigner(
          ephemeralKeypair,
          session.proof,
          session.address,
          session.maxEpoch,
        );

        const address = session.address;

        async function signAndSubmit(txType: string, params: Record<string, unknown>): Promise<{ tx: string }> {
          const buildRes = await fetch('/api/transactions/prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: txType, address, ...params }),
          });

          if (!buildRes.ok) {
            const err = await buildRes.json();
            throw new Error(err.error ?? 'Failed to build transaction');
          }

          const { txBytes: txBytesBase64 } = await buildRes.json();

          const txBytes = Uint8Array.from(atob(txBytesBase64), c => c.charCodeAt(0));
          const { signature } = await signer.signTransaction(txBytes);

          const result = await suiClient.executeTransactionBlock({
            transactionBlock: toBase64(txBytes),
            signature: [signature],
            options: { showEffects: true },
          });

          await suiClient.waitForTransaction({ digest: result.digest });

          return { tx: result.digest };
        }

        return {
          address,

          async send({ to, amount, asset }) {
            return signAndSubmit('send', { amount, recipient: to, asset });
          },

          async save({ amount }) {
            return signAndSubmit('save', { amount });
          },

          async withdraw({ amount }) {
            return signAndSubmit('withdraw', { amount });
          },

          async borrow({ amount }) {
            return signAndSubmit('borrow', { amount });
          },

          async repay({ amount }) {
            return signAndSubmit('repay', { amount });
          },
        };
      },
    };
  }, [session, status, suiClient]);

  return {
    agent,
    loading: status === 'loading',
    authenticated: status === 'authenticated',
    address: session?.address ?? null,
  };
}
