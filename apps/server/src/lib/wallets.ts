import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { env } from '../env.js';

let _suiClient: SuiJsonRpcClient | null = null;

export function getSuiClient(): SuiJsonRpcClient {
  if (!_suiClient) {
    const url = env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
    _suiClient = new SuiJsonRpcClient({ url, network: 'mainnet' });
  }
  return _suiClient;
}
