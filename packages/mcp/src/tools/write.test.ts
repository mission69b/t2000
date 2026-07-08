import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWriteTools } from './write.js';
import { T2000Error } from '@t2000/sdk';

// [v4.0 Phase B — 2026-05-26] Write surface is 3 tools: send, swap, pay.
// All DeFi (save/withdraw/borrow/repay/claim_rewards) + contact-store
// (contact_add/remove) tools were deleted in S.336.

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xowner'),
    balance: vi.fn().mockResolvedValue({
      stables: { USDC: 96.81 },
      available: 96.81,
      sui: { amount: 0.86, usdValue: 0.84 },
      totalUsd: 102.75,
    }),
    send: vi.fn().mockResolvedValue({
      success: true,
      tx: '0xdigest',
      digest: '0xdigest',
      amount: 10,
      to: '0xrecipient',
      asset: 'USDC',
      gasless: true,
      gasCost: 0,
    }),
    swap: vi.fn().mockResolvedValue({
      success: true,
      digest: '0xswapdigest',
      from: 'USDC',
      to: 'SUI',
      amountIn: 1,
      amountOut: 0.97,
    }),
    pay: vi.fn().mockResolvedValue({
      status: 200,
      body: { data: 'paid content' },
      paid: true,
      cost: 0.01,
      receipt: { reference: '0xdigest', timestamp: new Date().toISOString() },
    }),
    resolveRecipient: vi.fn().mockImplementation(async (input: string) => {
      const trimmed = input.trim();
      if (trimmed.startsWith('0x')) return { address: trimmed.toLowerCase() };
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.sui$/.test(trimmed.toLowerCase())) {
        return { address: '0xresolvedfromsuins', suinsName: trimmed.toLowerCase() };
      }
      throw new T2000Error('CONTACT_NOT_FOUND', `"${input}" is not a valid Sui address or saved contact.`);
    }),
  } as any;
}

describe('write tools (v4 surface)', () => {
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

  it('registers 5 write tools', () => {
    expect(tools.size).toBe(5);
    expect(tools.has('t2000_send')).toBe(true);
    expect(tools.has('t2000_swap')).toBe(true);
    expect(tools.has('t2000_pay')).toBe(true);
    expect(tools.has('t2000_agent_pay')).toBe(true);
    expect(tools.has('t2000_agent_review')).toBe(true);
  });

  it('does NOT register the deleted v3 DeFi / contact tools', () => {
    const banned = [
      't2000_save', 't2000_withdraw', 't2000_borrow', 't2000_repay',
      't2000_claim_rewards', 't2000_contact_add', 't2000_contact_remove',
    ];
    for (const name of banned) {
      expect(tools.has(name)).toBe(false);
    }
  });

  describe('t2000_send', () => {
    it('executes with explicit asset USDC', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({
        to: '0xrecipient',
        amount: 10,
        asset: 'USDC',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.digest).toBe('0xdigest');
      expect(agent.send).toHaveBeenCalledWith({ to: '0xrecipient', amount: 10, asset: 'USDC' });
    });

    it('executes with explicit asset USDsui', async () => {
      const handler = tools.get('t2000_send')!;
      await handler({ to: '0xrecipient', amount: 5, asset: 'USDsui' });
      expect(agent.send).toHaveBeenCalledWith({ to: '0xrecipient', amount: 5, asset: 'USDsui' });
    });

    it('executes with explicit asset SUI', async () => {
      const handler = tools.get('t2000_send')!;
      await handler({ to: '0xrecipient', amount: 0.5, asset: 'SUI' });
      expect(agent.send).toHaveBeenCalledWith({ to: '0xrecipient', amount: 0.5, asset: 'SUI' });
    });

    it('dryRun returns preview without signing — marks gasless for USDC', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({
        to: '0xrecipient',
        amount: 10,
        asset: 'USDC',
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.preview).toBe(true);
      expect(data.canSend).toBe(true);
      expect(data.amount).toBe(10);
      expect(data.asset).toBe('USDC');
      expect(data.gasless).toBe(true);
      expect(agent.send).not.toHaveBeenCalled();
    });

    it('dryRun marks gasless: false for SUI', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({
        to: '0xrecipient',
        amount: 0.5,
        asset: 'SUI',
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.gasless).toBe(false);
    });

    it('resolves SuiNS names through agent.resolveRecipient', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({
        to: 'alex.sui',
        amount: 10,
        asset: 'USDC',
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.to).toBe('0xresolvedfromsuins');
      expect(data.suinsName).toBe('alex.sui');
    });

    it('surfaces resolveRecipient errors as MCP tool errors', async () => {
      const handler = tools.get('t2000_send')!;
      const result = await handler({
        to: 'not-an-address',
        amount: 10,
        asset: 'USDC',
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('t2000_swap', () => {
    it('executes a swap through Cetus aggregator', async () => {
      const handler = tools.get('t2000_swap')!;
      const result = await handler({ from: 'USDC', to: 'SUI', amount: 1 });
      const data = JSON.parse(result.content[0].text);
      expect(data.digest).toBe('0xswapdigest');
      expect(data.amountOut).toBe(0.97);
      expect(agent.swap).toHaveBeenCalledWith({ from: 'USDC', to: 'SUI', amount: 1, slippage: undefined });
    });

    it('forwards custom slippage', async () => {
      const handler = tools.get('t2000_swap')!;
      await handler({ from: 'USDC', to: 'SUI', amount: 1, slippage: 0.005 });
      expect(agent.swap).toHaveBeenCalledWith({ from: 'USDC', to: 'SUI', amount: 1, slippage: 0.005 });
    });

    it('surfaces SDK errors as MCP tool errors', async () => {
      agent.swap.mockRejectedValue(new Error('insufficient liquidity'));
      const handler = tools.get('t2000_swap')!;
      const result = await handler({ from: 'USDC', to: 'SUI', amount: 1 });
      expect(result.isError).toBe(true);
    });
  });

  describe('t2000_pay', () => {
    it('forwards request to agent.pay', async () => {
      const handler = tools.get('t2000_pay')!;
      const result = await handler({
        url: 'https://mpp.t2000.ai/openai/v1/chat/completions',
        method: 'POST',
        body: '{"model":"gpt-4o","messages":[]}',
        maxPrice: 0.05,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.paid).toBe(true);
      expect(data.cost).toBe(0.01);
      expect(agent.pay).toHaveBeenCalled();
    });

    it('extracts and prefixes image URLs from response body', async () => {
      agent.pay.mockResolvedValue({
        status: 200,
        body: { images: [{ url: 'https://cdn.fal.ai/image.png' }] },
        paid: true,
      });
      const handler = tools.get('t2000_pay')!;
      const result = await handler({
        url: 'https://mpp.t2000.ai/fal/fal-ai/flux/dev',
        method: 'POST',
        body: '{"prompt":"x"}',
      });
      expect(result.content[0].text).toContain('Generated images:');
      expect(result.content[0].text).toContain('https://cdn.fal.ai/image.png');
    });

    it('surfaces SDK errors as MCP tool errors', async () => {
      agent.pay.mockRejectedValue(new Error('402 payment required'));
      const handler = tools.get('t2000_pay')!;
      const result = await handler({ url: 'https://mpp.t2000.ai/openai/v1', method: 'POST' });
      expect(result.isError).toBe(true);
    });
  });
});
