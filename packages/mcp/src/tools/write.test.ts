import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWriteTools } from './write.js';
import { T2000Error } from '@t2000/sdk';

// [v4.0 Phase B — 2026-05-26] Write surface is 3 tools: send, swap, pay.
// All DeFi (save/withdraw/borrow/repay/claim_rewards) + contact-store
// (contact_add/remove) tools were deleted in S.336.

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xowner'),
    signer: {
      getAddress: vi.fn().mockReturnValue('0xowner'),
      signTransaction: vi.fn().mockResolvedValue({ signature: 'sig-b64' }),
      signPersonalMessage: vi.fn().mockResolvedValue({ signature: 'sig-b64' }),
    },
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

  it('registers 4 write tools (agent_pay + agent_review deleted with the store)', () => {
    expect(tools.size).toBe(4);
    expect(tools.has('t2000_send')).toBe(true);
    expect(tools.has('t2000_swap')).toBe(true);
    expect(tools.has('t2000_pay')).toBe(true);
    expect(tools.has('t2000_agent_sell')).toBe(true);
    expect(tools.has('t2000_agent_pay')).toBe(false);
    expect(tools.has('t2000_agent_review')).toBe(false);
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

  describe('t2000_agent_sell', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal('fetch', fetchMock);
      fetchMock.mockReset();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('prepare → sign → submit; returns the listing + digest', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            nonce: 'n1',
            txBytes: Buffer.from('txbytes').toString('base64'),
            probe: { ok: true, amount: '0.02', currency: 'USDC' },
          }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, digest: '0xselldigest' }) });

      const handler = tools.get('t2000_agent_sell')!;
      const result = await handler({ endpoint: 'https://api.me.com/v1/search' });
      const data = JSON.parse(result.content[0].text);
      expect(data.ok).toBe(true);
      expect(data.listed).toBe(true);
      expect(data.pricePerCall).toBe('0.02 USDC');
      expect(data.digest).toBe('0xselldigest');
      expect(agent.signer.signTransaction).toHaveBeenCalled();
      // Both legs post the agent's own address — never a caller-supplied one.
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).address).toBe('0xowner');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).address).toBe('0xowner');
    });

    it('surfaces probe failures per-check without signing', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'Endpoint probe failed — fix the checks below and try again.' },
          probe: { ok: false, issues: [{ code: 'no-402', message: 'Expected 402, got 405' }] },
        }),
      });

      const handler = tools.get('t2000_agent_sell')!;
      const result = await handler({ endpoint: 'https://example.com' });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.probeIssues[0].message).toBe('Expected 402, got 405');
      expect(agent.signer.signTransaction).not.toHaveBeenCalled();
    });

    it('remove: true clears the listing (empty endpoint, no probe payload required)', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ nonce: 'n2', txBytes: Buffer.from('tx2').toString('base64'), probe: null }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, digest: '0xcleardigest' }) });

      const handler = tools.get('t2000_agent_sell')!;
      const result = await handler({ remove: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.listed).toBe(false);
      expect(data.endpoint).toBeNull();
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).endpoint).toBe('');
    });

    it('rejects a call with neither endpoint nor remove', async () => {
      const handler = tools.get('t2000_agent_sell')!;
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
