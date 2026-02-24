import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { DEFAULT_RPC_URL } from '../constants.js';
import { T2000Error } from '../errors.js';

let cachedClient: SuiClient | null = null;

export function getSuiClient(rpcUrl?: string): SuiClient {
  const url = rpcUrl ?? DEFAULT_RPC_URL;
  if (cachedClient) return cachedClient;
  cachedClient = new SuiClient({ url });
  return cachedClient;
}

export function createSuiClient(network: 'mainnet' | 'testnet' = 'mainnet'): SuiClient {
  return new SuiClient({ url: getFullnodeUrl(network) });
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
