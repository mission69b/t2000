'use client';

import { useMemo } from 'react';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { deserializeKeypair } from '@/lib/zklogin';
import { getStrategyAllocations } from '@/lib/strategies';

export interface ServiceResult {
  success: boolean;
  paymentDigest: string;
  price: string;
  serviceId: string;
  result: unknown;
}

export interface ServiceRetryMeta {
  serviceId: string;
  gatewayUrl: string;
  serviceBody: string;
  price: string;
}

export class ServiceDeliveryError extends Error {
  paymentDigest: string;
  meta: ServiceRetryMeta;

  constructor(message: string, paymentDigest: string, meta: ServiceRetryMeta) {
    super(message);
    this.name = 'ServiceDeliveryError';
    this.paymentDigest = paymentDigest;
    this.meta = meta;
  }
}

export interface StrategyBuyResult {
  buys: { asset: string; amount: number; tx: string }[];
  totalInvested: number;
  partial?: boolean;
  failedAsset?: string;
  error?: string;
}

export interface AgentActions {
  address: string;
  send(params: { to: string; amount: number; asset?: string }): Promise<{ tx: string }>;
  save(params: { amount: number; protocol?: string }): Promise<{ tx: string }>;
  withdraw(params: { amount: number; protocol?: string }): Promise<{ tx: string }>;
  borrow(params: { amount: number; protocol?: string }): Promise<{ tx: string }>;
  repay(params: { amount: number; protocol?: string }): Promise<{ tx: string }>;
  swap(params: { from: string; to: string; amount: number }): Promise<{ tx: string }>;
  rebalance(params: { amount: number; fromProtocol: string; toProtocol: string; fromAsset?: string; toAsset?: string }): Promise<{ tx: string }>;
  strategyBuy(params: { strategy: string; amount: number }): Promise<StrategyBuyResult>;
  claimRewards(): Promise<{ tx: string }>;
  payService(params: { serviceId?: string; fields?: Record<string, string>; url?: string; rawBody?: Record<string, unknown> }): Promise<ServiceResult>;
  retryServiceDelivery(paymentDigest: string, meta: ServiceRetryMeta): Promise<ServiceResult>;
}

export function useAgent() {
  const { session, status } = useZkLogin();

  const agent = useMemo((): { address: string; getInstance: () => Promise<AgentActions> } | null => {
    if (!session || status !== 'authenticated') return null;

    return {
      address: session.address,
      async getInstance(): Promise<AgentActions> {
        const { ZkLoginSigner } = await import('@t2000/sdk/browser');

        const ephemeralKeypair = deserializeKeypair(session.ephemeralKeyPair);
        const signer = new ZkLoginSigner(
          ephemeralKeypair,
          session.proof,
          session.address,
          session.maxEpoch,
        );

        const address = session.address;
        const jwt = session.jwt;

        /**
         * Sponsored transaction flow:
         * 1. POST /api/transactions/prepare — server builds tx + sponsors via Enoki
         * 2. Sign locally with zkLogin signer (non-custodial)
         * 3. POST /api/transactions/execute — server submits signature to Enoki
         */
        async function sponsoredTransaction(
          txType: string,
          params: Record<string, unknown>,
        ): Promise<{ tx: string }> {
          const prepareHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (jwt) {
            prepareHeaders['x-zklogin-jwt'] = jwt;
          }

          const prepareRes = await fetch('/api/transactions/prepare', {
            method: 'POST',
            headers: prepareHeaders,
            body: JSON.stringify({ type: txType, address, ...params }),
          });

          if (!prepareRes.ok) {
            const err = await prepareRes.json();
            throw new Error(err.error ?? 'Failed to prepare transaction');
          }

          const { bytes, digest } = await prepareRes.json();

          const txBytes = Uint8Array.from(atob(bytes), c => c.charCodeAt(0));
          const { signature } = await signer.signTransaction(txBytes);

          const executeRes = await fetch('/api/transactions/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ digest, signature }),
          });

          if (!executeRes.ok) {
            const err = await executeRes.json();
            throw new Error(err.error ?? 'Failed to execute transaction');
          }

          const result = await executeRes.json();
          return { tx: result.digest };
        }

        return {
          address,

          async send({ to, amount, asset }) {
            return sponsoredTransaction('send', { amount, recipient: to, asset });
          },

          async save({ amount, protocol }) {
            return sponsoredTransaction('save', { amount, protocol });
          },

          async withdraw({ amount, protocol }) {
            return sponsoredTransaction('withdraw', { amount, protocol });
          },

          async borrow({ amount, protocol }) {
            return sponsoredTransaction('borrow', { amount, protocol });
          },

          async repay({ amount, protocol }) {
            return sponsoredTransaction('repay', { amount, protocol });
          },

          async swap({ from, to, amount }) {
            return sponsoredTransaction('swap', { amount, fromAsset: from, toAsset: to });
          },

          async rebalance({ amount, fromProtocol, toProtocol, fromAsset, toAsset }) {
            return sponsoredTransaction('rebalance', { amount, fromProtocol, toProtocol, fromAsset, toAsset });
          },

          async strategyBuy({ strategy, amount }) {
            const alloc = getStrategyAllocations(strategy);
            if (!alloc) throw new Error(`Unknown strategy: ${strategy}`);

            const buys: { asset: string; amount: number; tx: string }[] = [];
            for (const [asset, pct] of Object.entries(alloc)) {
              const assetAmount = (amount * pct) / 100;
              if (assetAmount < 0.01) continue;
              try {
                const res = await sponsoredTransaction('swap', {
                  amount: assetAmount,
                  fromAsset: 'USDC',
                  toAsset: asset,
                });
                buys.push({ asset, amount: assetAmount, tx: res.tx });
              } catch (err) {
                if (buys.length > 0) {
                  return {
                    buys,
                    totalInvested: buys.reduce((sum, b) => sum + b.amount, 0),
                    partial: true,
                    failedAsset: asset,
                    error: err instanceof Error ? err.message : 'Swap failed',
                  };
                }
                throw err;
              }
            }
            return { buys, totalInvested: amount };
          },

          async claimRewards() {
            return sponsoredTransaction('claim-rewards', { amount: 0 });
          },

          async payService({ serviceId, fields, url, rawBody }) {
            const prepareHeaders: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            if (jwt) {
              prepareHeaders['x-zklogin-jwt'] = jwt;
            }

            const preparePayload = serviceId
              ? { serviceId, fields, address }
              : { url, rawBody, address };

            const prepareRes = await fetch('/api/services/prepare', {
              method: 'POST',
              headers: prepareHeaders,
              body: JSON.stringify(preparePayload),
            });

            if (!prepareRes.ok) {
              const err = await prepareRes.json();
              throw new Error(err.error ?? 'Failed to prepare service payment');
            }

            const prepareData = await prepareRes.json();

            if (prepareData.success && !prepareData.bytes) {
              return prepareData;
            }

            const { bytes, digest, meta } = prepareData;

            const txBytes = Uint8Array.from(atob(bytes), c => c.charCodeAt(0));
            const { signature } = await signer.signTransaction(txBytes);

            const completeRes = await fetch('/api/services/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signature, digest, meta }),
            });

            if (!completeRes.ok) {
              const err = await completeRes.json();
              if (err.paymentConfirmed && err.paymentDigest) {
                throw new ServiceDeliveryError(
                  err.error ?? 'Service delivery failed after payment',
                  err.paymentDigest,
                  err.meta ?? meta,
                );
              }
              throw new Error(err.error ?? 'Service execution failed');
            }

            return completeRes.json();
          },

          async retryServiceDelivery(paymentDigest, meta) {
            const retryRes = await fetch('/api/services/retry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentDigest, meta }),
            });

            if (!retryRes.ok) {
              const err = await retryRes.json();
              if (err.paymentConfirmed && err.paymentDigest) {
                throw new ServiceDeliveryError(
                  err.error ?? 'Service delivery retry failed',
                  err.paymentDigest,
                  err.meta ?? meta,
                );
              }
              throw new Error(err.error ?? 'Service retry failed');
            }

            return retryRes.json();
          },
        };
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
