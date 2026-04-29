import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

let _suiClient: SuiJsonRpcClient | null = null;

export function getSuiClient(): SuiJsonRpcClient {
  if (!_suiClient) {
    const url = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('mainnet');
    _suiClient = new SuiJsonRpcClient({ url, network: 'mainnet' });
  }
  return _suiClient;
}
