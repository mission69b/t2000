import type { SuiClient } from '@mysten/sui/client';
import type {
  SwapAdapter,
  SwapQuote,
  AdapterTxResult,
  AdapterCapability,
} from './types.js';
import * as cetusProtocol from '../protocols/cetus.js';

export class CetusAdapter implements SwapAdapter {
  readonly id = 'cetus';
  readonly name = 'Cetus';
  readonly version = '1.0.0';
  readonly capabilities: readonly AdapterCapability[] = ['swap'];

  private client!: SuiClient;

  async init(client: SuiClient): Promise<void> {
    this.client = client;
  }

  initSync(client: SuiClient): void {
    this.client = client;
  }

  async getQuote(from: string, to: string, amount: number): Promise<SwapQuote> {
    return cetusProtocol.getSwapQuote(
      this.client,
      from.toUpperCase() as 'USDC' | 'SUI',
      to.toUpperCase() as 'USDC' | 'SUI',
      amount,
    );
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
      fromAsset: from.toUpperCase() as 'USDC' | 'SUI',
      toAsset: to.toUpperCase() as 'USDC' | 'SUI',
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
    return [
      { from: 'USDC', to: 'SUI' },
      { from: 'SUI', to: 'USDC' },
    ];
  }

  async getPoolPrice(): Promise<number> {
    return cetusProtocol.getPoolPrice(this.client);
  }
}
