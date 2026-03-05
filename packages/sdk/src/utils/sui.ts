import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { DEFAULT_RPC_URL } from '../constants.js';
import { T2000Error } from '../errors.js';

let cachedClient: SuiJsonRpcClient | null = null;

export function getSuiClient(rpcUrl?: string): SuiJsonRpcClient {
  const url = rpcUrl ?? DEFAULT_RPC_URL;
  if (cachedClient) return cachedClient;
  cachedClient = new SuiJsonRpcClient({ url, network: 'mainnet' });
  return cachedClient;
}

export function createSuiClient(network: 'mainnet' | 'testnet' = 'mainnet'): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network), network });
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
