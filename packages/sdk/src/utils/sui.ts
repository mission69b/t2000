import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { DEFAULT_GRPC_URL, DEFAULT_RPC_URL } from '../constants.js';
import { T2000Error } from '../errors.js';

/**
 * Resolve the effective JSON-RPC URL: explicit arg > env var > default.
 * `T2000_RPC_URL` is an OPTIONAL override per the Greenfield SPEC's env
 * contract — no required vars, so we read inline (allowed by
 * `env-validation-gate.mdc` carve-out for packages with zero required
 * env vars).
 */
function resolveRpcUrl(rpcUrl?: string): string {
  if (rpcUrl) return rpcUrl;
  const envUrl = process.env.T2000_RPC_URL?.trim();
  if (envUrl) return envUrl;
  return DEFAULT_RPC_URL;
}

/**
 * Same shape as `resolveRpcUrl` for the gRPC endpoint.
 */
function resolveGrpcUrl(grpcUrl?: string): string {
  if (grpcUrl) return grpcUrl;
  const envUrl = process.env.T2000_GRPC_URL?.trim();
  if (envUrl) return envUrl;
  return DEFAULT_GRPC_URL;
}

/**
 * JSON-RPC client cache, keyed by URL. The earlier impl cached
 * unconditionally and ignored URL changes after the first call —
 * brittle for testnet smokes and custom-RPC test setups.
 */
const rpcClientCache = new Map<string, SuiJsonRpcClient>();

export function getSuiClient(rpcUrl?: string): SuiJsonRpcClient {
  const url = resolveRpcUrl(rpcUrl);
  const cached = rpcClientCache.get(url);
  if (cached) return cached;
  const client = new SuiJsonRpcClient({ url, network: 'mainnet' });
  rpcClientCache.set(url, client);
  return client;
}

export function createSuiClient(network: 'mainnet' | 'testnet' = 'mainnet'): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network), network });
}

/**
 * gRPC client cache, keyed by URL. Same rationale as the JSON-RPC cache:
 * different URLs must produce different clients.
 */
const grpcClientCache = new Map<string, SuiGrpcClient>();

/**
 * Cached `SuiGrpcClient` for gasless stablecoin transfer builds.
 *
 * [v4.0 Phase A Day 2 — SPEC_AGENT_WALLET_GREENFIELD §A]
 *
 * Why this exists: Sui mainnet's protocol-level gasless stablecoin transfers
 * (`0x2::balance::send_funds` on the USDC + USDsui allowlist) are detected
 * ONLY when the transaction is built through a `SuiGrpcClient`. The gRPC
 * client's build resolver inspects the PTB at `tx.build()` time and, if it
 * matches the gasless pattern, sets `gasPrice=0` + `gasBudget=0` automatically.
 * Building the SAME PTB through `SuiJsonRpcClient` produces the same bytes
 * but with non-zero gas — the tx still works, but the user pays SUI gas.
 *
 * Execution stays on JSON-RPC (`SuiJsonRpcClient.executeTransactionBlock`)
 * because (a) the rest of the SDK expects JSON-RPC and (b) Sui's docs
 * explicitly support a "build via gRPC, execute via JSON-RPC" hybrid:
 * https://docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers
 *
 * Override the endpoint with the `T2000_GRPC_URL` env var or the
 * `grpcUrl` arg. Cache is keyed by URL so multiple endpoints can
 * co-exist (e.g., the rare testnet smoke + production usage from the
 * same process).
 */
export function getSuiGrpcClient(grpcUrl?: string): SuiGrpcClient {
  const baseUrl = resolveGrpcUrl(grpcUrl);
  const cached = grpcClientCache.get(baseUrl);
  if (cached) return cached;
  const client = new SuiGrpcClient({ baseUrl, network: 'mainnet' });
  grpcClientCache.set(baseUrl, client);
  return client;
}

export function validateAddress(address: string): string {
  const normalized = normalizeSuiAddress(address);
  if (!isValidSuiAddress(normalized)) {
    throw new T2000Error('INVALID_ADDRESS', `Invalid Sui address: ${address}`);
  }
  return normalized;
}

export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Normalize a Sui coin type to its canonical long-form 64-hex address.
 * `0x2::sui::SUI` → `0x0000…0002::sui::SUI`. Idempotent on already-long
 * forms. Returns the input unchanged if it doesn't look like a coin type
 * (`<address>::<module>::<name>`) so callers can pass arbitrary strings
 * without crashing.
 *
 * Why this exists: BlockVision's `/v2/sui/coin/price/list` endpoint
 * silently returns an empty `prices` map for short-form coin types
 * (notably `0x2::sui::SUI` — the native gas coin). Internal callers must
 * pass the long form, but external callers (LLM tool args, cached
 * coin-type strings, audit logs) commonly use the short form. Normalize
 * before the network call, denormalize back to the caller's input shape
 * after, and short/long become interchangeable.
 */
export function normalizeCoinType(coinType: string): string {
  const parts = coinType.split('::');
  if (parts.length !== 3) return coinType;
  const [addr, mod, name] = parts;
  if (!addr.startsWith('0x')) return coinType;
  return `${normalizeSuiAddress(addr)}::${mod}::${name}`;
}
