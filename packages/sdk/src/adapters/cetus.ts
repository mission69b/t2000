import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type {
  SwapAdapter,
  SwapQuote,
  AdapterTxResult,
  AdapterCapability,
  ProtocolDescriptor,
} from './types.js';
import * as cetusProtocol from '../protocols/cetus.js';
import { CETUS_PACKAGE, STABLE_ASSETS, INVESTMENT_ASSETS } from '../constants.js';

export const descriptor: ProtocolDescriptor = {
  id: 'cetus',
  name: 'Cetus DEX',
  packages: [CETUS_PACKAGE],
  actionMap: {
    'router::swap': 'swap',
    'router::swap_ab_bc': 'swap',
    'router::swap_ab_cb': 'swap',
    'router::swap_ba_bc': 'swap',
    'router::swap_ba_cb': 'swap',
  },
};

export class CetusAdapter implements SwapAdapter {
  readonly id = 'cetus';
  readonly name = 'Cetus';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['swap'];

  private client!: SuiJsonRpcClient;

  async init(client: SuiJsonRpcClient): Promise<void> {
    this.client = client;
  }

  initSync(client: SuiJsonRpcClient): void {
    this.client = client;
  }

  async getQuote(from: string, to: string, amount: number): Promise<SwapQuote> {
    return cetusProtocol.getSwapQuote(this.client, from, to, amount);
  }

  async buildSwapTx(
    address: string,
    from: string,
    to: string,
    amount: number,
    maxSlippageBps?: number,
  ): Promise<AdapterTxResult & { estimatedOut: number; toDecimals: number }> {
    const result = await cetusProtocol.buildSwapTx({
      client: this.client,
      address,
      fromAsset: from,
      toAsset: to,
      amount,
      maxSlippageBps,
    });
    return {
      tx: result.tx,
      estimatedOut: result.estimatedOut,
      toDecimals: result.toDecimals,
    };
  }

  getSupportedPairs(): Array<{ from: string; to: string }> {
    const pairs: Array<{ from: string; to: string }> = [];
    for (const asset of Object.keys(INVESTMENT_ASSETS)) {
      pairs.push({ from: 'USDC', to: asset }, { from: asset, to: 'USDC' });
    }
    for (const a of STABLE_ASSETS) {
      for (const b of STABLE_ASSETS) {
        if (a !== b) pairs.push({ from: a, to: b });
      }
    }
    return pairs;
  }

  async getPoolPrice(): Promise<number> {
    return cetusProtocol.getPoolPrice(this.client);
  }

  async addSwapToTx(
    tx: Transaction,
    address: string,
    inputCoin: TransactionObjectArgument,
    from: string,
    to: string,
    amount: number,
    maxSlippageBps?: number,
  ): Promise<{ outputCoin: TransactionObjectArgument; estimatedOut: number; toDecimals: number }> {
    return cetusProtocol.addSwapToTx({
      tx,
      client: this.client,
      address,
      inputCoin,
      fromAsset: from,
      toAsset: to,
      amount,
      maxSlippageBps,
    });
  }
}
