import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWriteTools } from './write.js';
import { SafeguardError, T2000Error } from '@t2000/sdk';

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xowner'),
    balance: vi.fn().mockResolvedValue({
      available: 96.81,
      savings: 5.10,
      gasReserve: { sui: 0.86, usdEquiv: 0.84 },
      total: 102.75,
      assets: { USDC: 101.91 },
      stables: { USDC: 96.81 },
    }),
    send: vi.fn().mockResolvedValue({
      success: true, tx: '0xdigest', amount: 10, to: '0xrecipient',
      gasCost: 0.001, gasCostUnit: 'SUI', gasMethod: 'self-funded',
      balance: { available: 86.81 },
    }),
    save: vi.fn().mockResolvedValue({
      success: true, tx: '0xdigest', amount: 50, apy: 4.92,
      fee: 0.05, gasCost: 0.001, gasMethod: 'self-funded', savingsBalance: 55.10,
    }),
    withdraw: vi.fn().mockResolvedValue({
      success: true, tx: '0xdigest', amount: 5.10,
      gasCost: 0.001, gasMethod: 'self-funded',
    }),
    borrow: vi.fn().mockResolvedValue({
      success: true, tx: '0xdigest', amount: 2, fee: 0.001,
      healthFactor: 2.10, gasCost: 0.001, gasMethod: 'self-funded',
    }),
    repay: vi.fn().mockResolvedValue({
      success: true, tx: '0xdigest', amount: 2,
      remainingDebt: 0, gasCost: 0.001, gasMethod: 'self-funded',
    }),
    exchange: vi.fn().mockResolvedValue({
      success: true, tx: '0xdigest', fromAmount: 10, fromAsset: 'USDC',
      toAmount: 10.25, toAsset: 'SUI', priceImpact: 0.01,
      fee: 0.03, gasCost: 0.001, gasMethod: 'self-funded',
    }),
    exchangeQuote: vi.fn().mockResolvedValue({
      expectedOutput: 10.25, priceImpact: 0.01, poolPrice: 0.975,
      fee: { amount: 0.03, rate: 0.003 },
    }),
    rebalance: vi.fn().mockResolvedValue({
      executed: false, steps: [], fromProtocol: 'navi', fromAsset: 'USDC',
      toProtocol: 'suilend', toAsset: 'USDC', amount: 5.10,
      currentApy: 4.92, newApy: 5.50, annualGain: 0.30,
      estimatedSwapCost: 0, breakEvenDays: 0, txDigests: [], totalGasCost: 0,
    }),
    rates: vi.fn().mockResolvedValue({ USDC: { saveApy: 4.92, borrowApy: 8.5 } }),
    positions: vi.fn().mockResolvedValue({
      positions: [
        { protocol: 'navi', asset: 'USDC', type: 'save', amount: 5.10, apy: 4.92 },
      ],
    }),
    healthFactor: vi.fn().mockResolvedValue({
      healthFactor: 4.24, supplied: 5.10, borrowed: 0, maxBorrow: 3.50, liquidationThreshold: 0.8,
    }),
    maxBorrow: vi.fn().mockResolvedValue({
      maxAmount: 3.50, healthFactorAfter: 1.50, currentHF: 4.24,
    }),
    enforcer: {
      assertNotLocked: vi.fn(),
      check: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ locked: false, maxPerTx: 100, maxDailySend: 1000, dailyUsed: 0, dailyResetDate: '' }),
      recordUsage: vi.fn(),
    },
    contacts: {
      list: vi.fn().mockReturnValue([
        { name: 'Tom', address: '0xrecipient' },
      ]),
      resolve: vi.fn().mockImplementation((nameOrAddress: string) => {
        if (nameOrAddress.startsWith('0x')) return { address: nameOrAddress };
        if (nameOrAddress.toLowerCase() === 'tom') return { address: '0xrecipient', contactName: 'Tom' };
        throw new T2000Error('CONTACT_NOT_FOUND', `"${nameOrAddress}" is not a valid Sui address or saved contact.`);
      }),
    },
    investBuy: vi.fn().mockResolvedValue({
      success: true, tx: '0xinvest', type: 'buy', asset: 'SUI',
      amount: 25.5, price: 3.92, usdValue: 100, fee: 0.3,
      gasCost: 0.001, gasMethod: 'self-funded',
      position: { asset: 'SUI', totalAmount: 25.5, costBasis: 100, avgPrice: 3.92, currentPrice: 3.92, currentValue: 100, unrealizedPnL: 0, unrealizedPnLPct: 0, trades: [] },
    }),
    investSell: vi.fn().mockResolvedValue({
      success: true, tx: '0xinvsell', type: 'sell', asset: 'SUI',
      amount: 10, price: 4.0, usdValue: 40, fee: 0.12,
      gasCost: 0.001, gasMethod: 'self-funded', realizedPnL: 0.8,
      position: { asset: 'SUI', totalAmount: 15.5, costBasis: 60.78, avgPrice: 3.92, currentPrice: 4.0, currentValue: 62, unrealizedPnL: 1.22, unrealizedPnLPct: 2.0, trades: [] },
    }),
    getPortfolio: vi.fn().mockResolvedValue({
      positions: [{ asset: 'SUI', totalAmount: 25.5, costBasis: 100, avgPrice: 3.92, currentPrice: 4.0, currentValue: 102, unrealizedPnL: 2, unrealizedPnLPct: 2.0, trades: [] }],
      totalInvested: 100, totalValue: 102, unrealizedPnL: 2, unrealizedPnLPct: 2.0, realizedPnL: 0,
    }),
  } as any;
}

describe('write tools', () => {
  let server: McpServer;
  let agent: ReturnType<typeof createMockAgent>;
  let tools: Map<string, Function>;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    agent = createMockAgent();
    tools = new Map();

    const origTool = server.tool.bind(server) as (...args: any[]) => any;
    server.tool = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      tools.set(name, handler);
      return origTool(...args);
    }) as any;

    registerWriteTools(server, agent);
  });

  it('should register 11 write tools', () => {
    expect(tools.size).toBe(12);
    expect(tools.has('t2000_send')).toBe(true);
    expect(tools.has('t2000_save')).toBe(true);
    expect(tools.has('t2000_withdraw')).toBe(true);
    expect(tools.has('t2000_borrow')).toBe(true);
    expect(tools.has('t2000_repay')).toBe(true);
    expect(tools.has('t2000_exchange')).toBe(true);
    expect(tools.has('t2000_rebalance')).toBe(true);
    expect(tools.has('t2000_invest')).toBe(true);
    expect(tools.has('t2000_strategy')).toBe(true);
    expect(tools.has('t2000_auto_invest')).toBe(true);
  });

  describe('t2000_send', () => {
    it('should return preview with dryRun: true', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({ to: '0xrecipient', amount: 10, dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
      expect(data.canSend).toBe(true);
      expect(data.amount).toBe(10);
      expect(data.balanceAfter).toBeCloseTo(86.81);
      expect(agent.send).not.toHaveBeenCalled();
    });

    it('should execute send with dryRun: false', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({ to: '0xrecipient', amount: 10, dryRun: false });
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.tx).toBe('0xdigest');
      expect(agent.send).toHaveBeenCalled();
    });

    it('should execute send when dryRun is omitted', async () => {
      const handler = tools.get('t2000_send')!;
      await handler({ to: '0xrecipient', amount: 10 });
      expect(agent.send).toHaveBeenCalled();
    });

    it('should resolve contact name in dryRun preview', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({ to: 'Tom', amount: 10, dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
      expect(data.to).toBe('0xrecipient');
      expect(data.contactName).toBe('Tom');
    });

    it('should send to contact name', async () => {
      const handler = tools.get('t2000_send')!;
      await handler({ to: 'Tom', amount: 10 });
      expect(agent.send).toHaveBeenCalledWith({ to: 'Tom', amount: 10, asset: undefined });
    });

    it('should return error for unknown contact', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({ to: 'Unknown', amount: 10 });
      expect(result.isError).toBe(true);
    });

    it('should return safeguard error when locked', async () => {
      agent.enforcer.check.mockImplementation(() => {
        throw new SafeguardError('locked', {});
      });
      const handler = tools.get('t2000_send')!;
      const result = await handler({ to: '0xrecipient', amount: 10, dryRun: true });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.code).toBe('SAFEGUARD_BLOCKED');
    });

    it('should return safeguard error when exceeding maxPerTx', async () => {
      agent.enforcer.check.mockImplementation(() => {
        throw new SafeguardError('maxPerTx', { attempted: 200, limit: 100 });
      });
      const handler = tools.get('t2000_send')!;
      const result = await handler({ to: '0xrecipient', amount: 200, dryRun: true });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.code).toBe('SAFEGUARD_BLOCKED');
      expect(data.details.rule).toBe('maxPerTx');
    });
  });

  describe('t2000_save', () => {
    it('should return preview with dryRun: true', async () => {
      const handler = tools.get('t2000_save')!;
      const result = await handler({ amount: 50, dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
      expect(data.amount).toBe(50);
      expect(data.currentApy).toBe(4.92);
    });

    it('should execute save', async () => {
      const handler = tools.get('t2000_save')!;
      const result = await handler({ amount: 50 });
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(agent.save).toHaveBeenCalledWith({ amount: 50 });
    });
  });

  describe('t2000_withdraw', () => {
    it('should return preview with dryRun: true', async () => {
      const handler = tools.get('t2000_withdraw')!;
      const result = await handler({ amount: 5, dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
      expect(data.amount).toBe(5);
    });

    it('should execute withdraw', async () => {
      const handler = tools.get('t2000_withdraw')!;
      await handler({ amount: 'all' });
      expect(agent.withdraw).toHaveBeenCalledWith({ amount: 'all' });
    });
  });

  describe('t2000_borrow', () => {
    it('should return preview with dryRun: true', async () => {
      const handler = tools.get('t2000_borrow')!;
      const result = await handler({ amount: 2, dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
      expect(data.maxBorrow).toBe(3.50);
    });

    it('should execute borrow', async () => {
      const handler = tools.get('t2000_borrow')!;
      await handler({ amount: 2 });
      expect(agent.borrow).toHaveBeenCalledWith({ amount: 2 });
    });
  });

  describe('t2000_repay', () => {
    it('should return preview with dryRun: true', async () => {
      const handler = tools.get('t2000_repay')!;
      const result = await handler({ amount: 2, dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
    });
  });

  describe('t2000_exchange', () => {
    it('should return quote with dryRun: true', async () => {
      const handler = tools.get('t2000_exchange')!;
      const result = await handler({ amount: 10, from: 'USDC', to: 'SUI', dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
      expect(data.expectedOutput).toBe(10.25);
      expect(agent.exchange).not.toHaveBeenCalled();
    });

    it('should execute exchange', async () => {
      const handler = tools.get('t2000_exchange')!;
      await handler({ amount: 10, from: 'USDC', to: 'SUI' });
      expect(agent.exchange).toHaveBeenCalled();
    });
  });

  describe('t2000_rebalance', () => {
    it('should default to dryRun: true', async () => {
      const handler = tools.get('t2000_rebalance')!;
      await handler({});
      expect(agent.rebalance).toHaveBeenCalledWith({
        dryRun: true,
        minYieldDiff: undefined,
        maxBreakEven: undefined,
      });
    });

    it('should execute when dryRun: false', async () => {
      const handler = tools.get('t2000_rebalance')!;
      await handler({ dryRun: false });
      expect(agent.rebalance).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
    });
  });

  describe('t2000_invest', () => {
    it('should return preview with dryRun: true (buy)', async () => {
      const handler = tools.get('t2000_invest')!;
      const result = await handler({ action: 'buy', asset: 'SUI', amount: 100, dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
      expect(data.action).toBe('buy');
      expect(data.asset).toBe('SUI');
      expect(data.amount).toBe(100);
      expect(agent.investBuy).not.toHaveBeenCalled();
    });

    it('should execute buy', async () => {
      const handler = tools.get('t2000_invest')!;
      const result = await handler({ action: 'buy', asset: 'SUI', amount: 100 });
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.type).toBe('buy');
      expect(agent.investBuy).toHaveBeenCalled();
    });

    it('should execute sell', async () => {
      const handler = tools.get('t2000_invest')!;
      const result = await handler({ action: 'sell', asset: 'SUI', amount: 40 });
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.type).toBe('sell');
      expect(agent.investSell).toHaveBeenCalled();
    });

    it('should handle sell all', async () => {
      const handler = tools.get('t2000_invest')!;
      await handler({ action: 'sell', asset: 'SUI', amount: 'all' });
      expect(agent.investSell).toHaveBeenCalledWith(expect.objectContaining({ usdAmount: 'all' }));
    });

    it('should pass slippage when provided', async () => {
      const handler = tools.get('t2000_invest')!;
      await handler({ action: 'buy', asset: 'SUI', amount: 100, slippage: 5 });
      expect(agent.investBuy).toHaveBeenCalledWith(expect.objectContaining({ maxSlippage: 0.05 }));
    });

    it('should return error for sell all with no position in dryRun', async () => {
      agent.getPortfolio.mockResolvedValue({
        positions: [], totalInvested: 0, totalValue: 0,
        unrealizedPnL: 0, unrealizedPnLPct: 0, realizedPnL: 0,
      });
      const handler = tools.get('t2000_invest')!;
      const result = await handler({ action: 'sell', asset: 'SUI', amount: 'all', dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No SUI position');
    });

    it('should reject buy with non-number amount', async () => {
      const handler = tools.get('t2000_invest')!;
      const result = await handler({ action: 'buy', asset: 'SUI', amount: 'all' });
      expect(result.isError).toBe(true);
    });
  });
});
