import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWriteTools } from './write.js';
import { SafeguardError } from '@t2000/sdk';

vi.mock('@t2000/sdk', async () => {
  const actual = await vi.importActual('@t2000/sdk') as any;
  return {
    ...actual,
    validateAddress: vi.fn().mockReturnValue(true),
  };
});

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

    const origTool = server.tool.bind(server);
    server.tool = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      tools.set(name, handler);
      return origTool(...args);
    }) as any;

    registerWriteTools(server, agent);
  });

  it('should register 7 write tools', () => {
    expect(tools.size).toBe(7);
    expect(tools.has('t2000_send')).toBe(true);
    expect(tools.has('t2000_save')).toBe(true);
    expect(tools.has('t2000_withdraw')).toBe(true);
    expect(tools.has('t2000_borrow')).toBe(true);
    expect(tools.has('t2000_repay')).toBe(true);
    expect(tools.has('t2000_exchange')).toBe(true);
    expect(tools.has('t2000_rebalance')).toBe(true);
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

    it('should return error for invalid address', async () => {
      const { validateAddress } = await import('@t2000/sdk');
      vi.mocked(validateAddress).mockReturnValueOnce(false);
      const handler = tools.get('t2000_send')!;
      const result = await handler({ to: 'invalid', amount: 10 });
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
});
