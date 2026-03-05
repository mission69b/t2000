import type {
  LendingAdapter,
  SwapAdapter,
  LendingRates,
  SwapQuote,
  AdapterPositions,
} from './types.js';
import { T2000Error } from '../errors.js';

export class ProtocolRegistry {
  private lending: Map<string, LendingAdapter> = new Map();
  private swap: Map<string, SwapAdapter> = new Map();

  registerLending(adapter: LendingAdapter): void {
    this.lending.set(adapter.id, adapter);
  }

  registerSwap(adapter: SwapAdapter): void {
    this.swap.set(adapter.id, adapter);
  }

  async bestSaveRate(asset: string): Promise<{ adapter: LendingAdapter; rate: LendingRates }> {
    const candidates: Array<{ adapter: LendingAdapter; rate: LendingRates }> = [];

    for (const adapter of this.lending.values()) {
      if (!adapter.supportedAssets.includes(asset)) continue;
      if (!adapter.capabilities.includes('save')) continue;
      try {
        const rate = await adapter.getRates(asset);
        candidates.push({ adapter, rate });
      } catch {
        // skip adapters that fail to fetch rates
      }
    }

    if (candidates.length === 0) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `No lending adapter supports saving ${asset}`);
    }

    candidates.sort((a, b) => b.rate.saveApy - a.rate.saveApy);
    return candidates[0];
  }

  async bestBorrowRate(asset: string, opts?: { requireSameAssetBorrow?: boolean }): Promise<{ adapter: LendingAdapter; rate: LendingRates }> {
    const candidates: Array<{ adapter: LendingAdapter; rate: LendingRates }> = [];

    for (const adapter of this.lending.values()) {
      if (!adapter.supportedAssets.includes(asset)) continue;
      if (!adapter.capabilities.includes('borrow')) continue;
      if (opts?.requireSameAssetBorrow && !adapter.supportsSameAssetBorrow) continue;
      try {
        const rate = await adapter.getRates(asset);
        candidates.push({ adapter, rate });
      } catch {
        // skip
      }
    }

    if (candidates.length === 0) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `No lending adapter supports borrowing ${asset}`);
    }

    candidates.sort((a, b) => a.rate.borrowApy - b.rate.borrowApy);
    return candidates[0];
  }

  async bestSwapQuote(from: string, to: string, amount: number): Promise<{ adapter: SwapAdapter; quote: SwapQuote }> {
    const candidates: Array<{ adapter: SwapAdapter; quote: SwapQuote }> = [];

    for (const adapter of this.swap.values()) {
      const pairs = adapter.getSupportedPairs();
      if (!pairs.some(p => p.from === from && p.to === to)) continue;
      try {
        const quote = await adapter.getQuote(from, to, amount);
        candidates.push({ adapter, quote });
      } catch {
        // skip
      }
    }

    if (candidates.length === 0) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `No swap adapter supports ${from} → ${to}`);
    }

    candidates.sort((a, b) => b.quote.expectedOutput - a.quote.expectedOutput);
    return candidates[0];
  }

  async allRates(asset: string): Promise<Array<{ protocol: string; protocolId: string; rates: LendingRates }>> {
    const results: Array<{ protocol: string; protocolId: string; rates: LendingRates }> = [];
    for (const adapter of this.lending.values()) {
      if (!adapter.supportedAssets.includes(asset)) continue;
      try {
        const rates = await adapter.getRates(asset);
        results.push({ protocol: adapter.name, protocolId: adapter.id, rates });
      } catch {
        // skip
      }
    }
    return results;
  }

  async allPositions(address: string): Promise<Array<{ protocol: string; protocolId: string; positions: AdapterPositions }>> {
    const results: Array<{ protocol: string; protocolId: string; positions: AdapterPositions }> = [];
    for (const adapter of this.lending.values()) {
      try {
        const positions = await adapter.getPositions(address);
        if (positions.supplies.length > 0 || positions.borrows.length > 0) {
          results.push({ protocol: adapter.name, protocolId: adapter.id, positions });
        }
      } catch {
        // skip
      }
    }
    return results;
  }

  getLending(id: string): LendingAdapter | undefined {
    return this.lending.get(id);
  }

  getSwap(id: string): SwapAdapter | undefined {
    return this.swap.get(id);
  }

  listLending(): LendingAdapter[] {
    return [...this.lending.values()];
  }

  listSwap(): SwapAdapter[] {
    return [...this.swap.values()];
  }
}
