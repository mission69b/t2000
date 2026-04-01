import type {
  LendingAdapter,
  LendingRates,
  AdapterPositions,
} from './types.js';
import { STABLE_ASSETS } from '../constants.js';
import { T2000Error } from '../errors.js';

export class ProtocolRegistry {
  private lending: Map<string, LendingAdapter> = new Map();

  registerLending(adapter: LendingAdapter): void {
    this.lending.set(adapter.id, adapter);
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

  async bestSaveRateAcrossAssets(): Promise<{ adapter: LendingAdapter; rate: LendingRates; asset: string }> {
    const candidates: Array<{ adapter: LendingAdapter; rate: LendingRates; asset: string }> = [];

    for (const asset of STABLE_ASSETS) {
      for (const adapter of this.lending.values()) {
        if (!adapter.supportedAssets.includes(asset)) continue;
        if (!adapter.capabilities.includes('save')) continue;
        try {
          const rate = await adapter.getRates(asset);
          candidates.push({ adapter, rate, asset });
        } catch { /* skip */ }
      }
    }

    if (candidates.length === 0) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', 'No lending adapter found for any stablecoin');
    }

    candidates.sort((a, b) => b.rate.saveApy - a.rate.saveApy);
    return candidates[0];
  }

  async allRatesAcrossAssets(): Promise<Array<{ protocol: string; protocolId: string; asset: string; rates: LendingRates }>> {
    const results: Array<{ protocol: string; protocolId: string; asset: string; rates: LendingRates }> = [];
    const seen = new Set<string>();
    for (const asset of STABLE_ASSETS) {
      if (seen.has(asset)) continue;
      seen.add(asset);
      for (const adapter of this.lending.values()) {
        if (!adapter.supportedAssets.includes(asset)) continue;
        try {
          const rates = await adapter.getRates(asset);
          if (rates.saveApy > 0 || rates.borrowApy > 0) {
            results.push({ protocol: adapter.name, protocolId: adapter.id, asset, rates });
          }
        } catch { /* skip */ }
      }
    }
    return results;
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
    const errors: string[] = [];
    for (const adapter of this.lending.values()) {
      try {
        const positions = await adapter.getPositions(address);
        if (positions.supplies.length > 0 || positions.borrows.length > 0) {
          results.push({ protocol: adapter.name, protocolId: adapter.id, positions });
        }
      } catch (err) {
        errors.push(`${adapter.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (results.length === 0 && errors.length > 0) {
      throw new T2000Error('PROTOCOL_UNAVAILABLE', `Protocol queries failed (${errors.length}/${this.lending.size}): ${errors.join('; ')}`);
    }
    return results;
  }

  getLending(id: string): LendingAdapter | undefined {
    return this.lending.get(id);
  }

  listLending(): LendingAdapter[] {
    return [...this.lending.values()];
  }
}
