import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { DEFAULT_GRAPHQL_URL, DEFAULT_GRPC_URL, DEFAULT_RPC_URL } from '../constants.js';
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
 * Same shape as `resolveRpcUrl` for the GraphQL endpoint.
 */
function resolveGraphqlUrl(graphqlUrl?: string): string {
  if (graphqlUrl) return graphqlUrl;
  const envUrl = process.env.T2000_GRAPHQL_URL?.trim();
  if (envUrl) return envUrl;
  return DEFAULT_GRAPHQL_URL;
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

/**
 * GraphQL client cache, keyed by URL. Same rationale as the JSON-RPC / gRPC
 * caches: different URLs must produce different clients.
 */
const graphqlClientCache = new Map<string, SuiGraphQLClient>();

/**
 * Cached `SuiGraphQLClient` for the transaction-history read.
 *
 * [gRPC migration Stage 1 — stub; wired in Stage 2]
 *
 * Why this exists: every portfolio read except history has a Core/gRPC
 * equivalent and moves to `client.core.*` (Stage 1+). The history read
 * (legacy `queryTransactionBlocks`) has NO Core/gRPC method, so when Mysten
 * deactivates the public JSON-RPC fullnode (2026-07-31) it must go through
 * GraphQL instead. This client is the home for that path. Stage 2 rewrites
 * `history.ts` to query through `getSuiGraphQLClient()` and validates it
 * against the parity probe; until then this is an unused, ready entry point.
 *
 * Override the endpoint with the `T2000_GRAPHQL_URL` env var or the
 * `graphqlUrl` arg. Cache is keyed by URL so multiple endpoints can co-exist.
 */
export function getSuiGraphQLClient(graphqlUrl?: string): SuiGraphQLClient {
  const url = resolveGraphqlUrl(graphqlUrl);
  const cached = graphqlClientCache.get(url);
  if (cached) return cached;
  const client = new SuiGraphQLClient({ url, network: 'mainnet' });
  graphqlClientCache.set(url, client);
  return client;
}

/**
 * Resolve the active read transport from `T2000_TRANSPORT` (`grpc` | `jsonrpc`).
 * Default is `jsonrpc` so the flip is opt-in per the migration plan; an
 * unrecognized value also falls back to `jsonrpc` (fail-safe to the live
 * transport rather than the not-yet-soaked one).
 */
function resolveReadTransport(): 'grpc' | 'jsonrpc' {
  return process.env.T2000_TRANSPORT?.trim().toLowerCase() === 'grpc' ? 'grpc' : 'jsonrpc';
}

/**
 * Transport-agnostic READ client, selected by `T2000_TRANSPORT`.
 *
 * [gRPC migration Stage 1 — SPEC_FULL_GRPC_MIGRATION §Stage 1]
 *
 * Both `SuiJsonRpcClient` and `SuiGrpcClient` expose `.core` (the unified
 * `CoreClient`), so callers that read only through `client.core.*` (today:
 * `balance.ts`) work identically on either transport. This selector is the
 * single seam the env flag flips: `T2000_TRANSPORT=grpc` routes reads over
 * gRPC, anything else stays on JSON-RPC. Writes/execution are NOT affected —
 * they keep their own `SuiJsonRpcClient` until Stage 4.
 *
 * Returned as `ClientWithCoreApi` so callers can only reach the parity-safe
 * `.core` surface, not transport-specific methods.
 *
 * On the `jsonrpc` branch we reuse the caller's existing JSON-RPC client (it
 * already carries the resolved/overridden RPC URL) rather than re-resolving a
 * fresh one — so a custom `rpcUrl` keeps working when the flag is off.
 *
 * NOTE: a custom `rpcUrl` does NOT carry over to the gRPC branch — when
 * `T2000_TRANSPORT=grpc`, the gRPC endpoint comes from the `grpcUrl` arg, then
 * `T2000_GRPC_URL`, then `DEFAULT_GRPC_URL`. A caller pointing reads at a
 * non-default fullnode must set `T2000_GRPC_URL` (or pass `grpcUrl`) to match.
 */
export function getSuiReadClient(
  jsonRpcClient: SuiJsonRpcClient,
  grpcUrl?: string,
): ClientWithCoreApi {
  return resolveReadTransport() === 'grpc' ? getSuiGrpcClient(grpcUrl) : jsonRpcClient;
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
