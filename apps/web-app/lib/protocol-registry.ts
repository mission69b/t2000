import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import {
  ProtocolRegistry,
  NaviAdapter,
} from '@t2000/sdk/adapters';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';

type RegistryInstance = InstanceType<typeof ProtocolRegistry>;
type ClientInstance = InstanceType<typeof SuiJsonRpcClient>;

const globalForRegistry = globalThis as unknown as {
  _protocolRegistry: RegistryInstance | undefined;
  _suiRpcClient: ClientInstance | undefined;
};

function createRegistry(): RegistryInstance {
  const client = getClient();
  const registry = new ProtocolRegistry();

  const navi = new NaviAdapter();
  navi.initSync(client);
  registry.registerLending(navi);

  return registry;
}

export function getClient(): ClientInstance {
  if (!globalForRegistry._suiRpcClient) {
    globalForRegistry._suiRpcClient = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(SUI_NETWORK),
      network: SUI_NETWORK,
    });
  }
  return globalForRegistry._suiRpcClient;
}

export function getRegistry(): RegistryInstance {
  if (!globalForRegistry._protocolRegistry) {
    globalForRegistry._protocolRegistry = createRegistry();
  }
  return globalForRegistry._protocolRegistry;
}
