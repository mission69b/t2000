import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CetusAdapter } from './cetus.js';
import * as cetusProtocol from '../protocols/cetus.js';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

vi.mock('../protocols/cetus.js', () => ({
  getSwapQuote: vi.fn(),
  buildSwapTx: vi.fn(),
  getPoolPrice: vi.fn(),
}));

describe('CetusAdapter', () => {
  let adapter: CetusAdapter;
  const mockClient = {} as SuiJsonRpcClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new CetusAdapter();
    await adapter.init(mockClient);
  });

  it('has correct metadata', () => {
    expect(adapter.id).toBe('cetus');
    expect(adapter.name).toBe('Cetus');
    expect(adapter.capabilities).toContain('swap');
  });

  it('getSupportedPairs returns USDC/SUI pairs', () => {
    const pairs = adapter.getSupportedPairs();
    expect(pairs).toContainEqual({ from: 'USDC', to: 'SUI' });
    expect(pairs).toContainEqual({ from: 'SUI', to: 'USDC' });
  });

  it('getQuote delegates to cetus protocol', async () => {
    const mockQuote = { expectedOutput: 28.5, priceImpact: 0.01, poolPrice: 3.5 };
    vi.mocked(cetusProtocol.getSwapQuote).mockResolvedValue(mockQuote);

    const result = await adapter.getQuote('USDC', 'SUI', 100);
    expect(result).toEqual(mockQuote);
    expect(cetusProtocol.getSwapQuote).toHaveBeenCalledWith(mockClient, 'USDC', 'SUI', 100);
  });

  it('buildSwapTx delegates and returns estimatedOut', async () => {
    const tx = new Transaction();
    vi.mocked(cetusProtocol.buildSwapTx).mockResolvedValue({ tx, estimatedOut: 28500000, toDecimals: 9 });

    const result = await adapter.buildSwapTx('0xaddr', 'USDC', 'SUI', 100, 50);
    expect(result.tx).toBe(tx);
    expect(result.estimatedOut).toBe(28500000);
    expect(result.toDecimals).toBe(9);
    expect(cetusProtocol.buildSwapTx).toHaveBeenCalledWith({
      client: mockClient,
      address: '0xaddr',
      fromAsset: 'USDC',
      toAsset: 'SUI',
      amount: 100,
      maxSlippageBps: 50,
    });
  });

  it('getPoolPrice delegates to cetus', async () => {
    vi.mocked(cetusProtocol.getPoolPrice).mockResolvedValue(3.45);
    const price = await adapter.getPoolPrice();
    expect(price).toBe(3.45);
  });
});
