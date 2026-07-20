import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { ServeNetwork } from './types.js';

// ---------------------------------------------------------------------------
// Chain plumbing — same shape as the gateway's x402-dialect.ts (the reference
// composition). All reads are gRPC; this package never touches JSON-RPC.
//
// Cache policy: the chain identifier (genesis digest) is immutable per
// network — cached forever. The epoch advances ~daily and x402 requirements
// are valid for [epoch, epoch+1], so a 10-minute TTL is conservatively fresh.
// ---------------------------------------------------------------------------

const FULLNODE_URLS: Record<ServeNetwork, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
};

const EPOCH_TTL_MS = 10 * 60 * 1000;

export interface ChainInfo {
  chain: string;
  epoch: string;
}

interface ChainState {
  client?: SuiGrpcClient;
  chainId?: string;
  epoch?: { value: string; fetchedAt: number };
}

const state: Partial<Record<ServeNetwork, ChainState>> = {};

export function getGrpcClient(network: ServeNetwork, rpcUrl?: string): SuiGrpcClient {
  const s = (state[network] ??= {});
  if (!s.client) {
    s.client = new SuiGrpcClient({
      baseUrl: rpcUrl ?? FULLNODE_URLS[network],
      network,
    });
  }
  return s.client;
}

export async function getChainInfo(network: ServeNetwork, rpcUrl?: string): Promise<ChainInfo> {
  const client = getGrpcClient(network, rpcUrl);
  const s = (state[network] ??= {});
  if (!s.chainId) {
    const res = await client.core.getChainIdentifier();
    s.chainId = res.chainIdentifier;
  }
  if (!s.epoch || Date.now() - s.epoch.fetchedAt > EPOCH_TTL_MS) {
    const res = await client.core.getCurrentSystemState();
    s.epoch = { value: String(res.systemState.epoch), fetchedAt: Date.now() };
  }
  return { chain: s.chainId, epoch: s.epoch.value };
}

/** Test seam — reset module caches between cases. */
export function __resetChainCaches(): void {
  delete state.mainnet;
  delete state.testnet;
}

/** Test seam — pre-seed chain info so tests never hit the network. */
export function __seedChainInfo(network: ServeNetwork, chain: string, epoch: string): void {
  const s = (state[network] ??= {});
  s.chainId = chain;
  s.epoch = { value: epoch, fetchedAt: Date.now() };
}
