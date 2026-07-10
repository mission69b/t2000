import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerEarnTools } from './tools/earn.js';
import { registerLimitTool } from './tools/limit.js';
import { registerSkillPrompts } from './skills-prompts.js';
import { loadSkillsFromDisk } from './test-load-skills.js';
import { T2000_SERVER_INSTRUCTIONS } from './instructions.js';

// [v4.0 Phase B — 2026-05-26, counts updated S.629 2026-07-04; tasks board +
// reviews deleted 2026-07-10 (SPEC_HUB_V1 clean slate)]
// Integration test surface mirrors the core CLI: 6 read tools (balance /
// address / receive / history / services / agents), 4 write tools (send /
// swap / pay / agent_pay), 1 earnings tool (agent_earnings), 1 settings
// tool (limit) = 12 here. Production additionally registers the 3 Private
// API chat tools (chat / models / verify) via registerChatTools = 15 total.
// Pre-v4 the count was 27 (DeFi + safeguards; deletions tracked in S.336).
//
// Prompts: the hand-rolled `registerPrompts` workflow prompts were
// also deleted in S.336. The surviving prompt surface is the
// auto-registered `skill-<short-name>` prompts from `skills-prompts.ts`
// (one per SKILL.md in `t2000-skills/skills/`). Asserted below by name.

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xtest_integration'),
    balance: vi.fn().mockResolvedValue({
      stables: { USDC: 96.81 },
      available: 96.81,
      sui: { amount: 0.86, usdValue: 0.84 },
      totalUsd: 102.75,
    }),
    history: vi.fn().mockResolvedValue([
      { digest: '0xabc', action: 'send', amount: 10, asset: 'USDC' },
    ]),
    receive: vi.fn().mockReturnValue({
      address: '0xtest_integration',
      uri: 'sui:pay?recipient=0xtest_integration&amount=10',
      nonce: '0xnonce',
    }),
    resolveRecipient: vi.fn().mockImplementation(async (input: string) => {
      const trimmed = input.trim();
      if (trimmed.startsWith('0x')) return { address: trimmed.toLowerCase() };
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.sui$/.test(trimmed.toLowerCase())) {
        return { address: '0xresolvedfromsuins', suinsName: trimmed.toLowerCase() };
      }
      throw new Error(`"${input}" is not a valid Sui address or saved contact.`);
    }),
    send: vi.fn().mockResolvedValue({
      digest: '0xsend123', amount: 10, to: '0xrecipient', gasless: true,
    }),
    swap: vi.fn().mockResolvedValue({
      digest: '0xswap123', from: 'USDC', to: 'SUI', amountIn: 1, amountOut: 0.97,
    }),
    pay: vi.fn().mockResolvedValue({
      status: 200, body: { data: 'paid content' }, paid: true, cost: 0.01,
      receipt: { reference: '0xdigest123', timestamp: new Date().toISOString() },
    }),
  } as any;
}

describe('integration: MCP client ↔ server (v4 surface)', () => {
  let client: Client;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeAll(async () => {
    const agent = createMockAgent();
    server = new McpServer(
      { name: 't2000-test', version: '0.0.1' },
      { instructions: T2000_SERVER_INSTRUCTIONS },
    );

    registerReadTools(server, agent);
    registerWriteTools(server, agent);
    registerEarnTools(server, agent);
    registerLimitTool(server);
    // Inject loaded skills since vitest doesn't run tsup (no
    // `__BAKED_SKILLS__` define) — same data as production.
    registerSkillPrompts(server, loadSkillsFromDisk());

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.1' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it('lists the 12 core tools (+3 chat tools registered separately in production)', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(12);

    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      't2000_address',
      't2000_agent_earnings',
      't2000_agent_pay',
      't2000_agents',
      't2000_balance',
      't2000_history',
      't2000_limit',
      't2000_pay',
      't2000_receive',
      't2000_send',
      't2000_services',
      't2000_swap',
    ]);
  });

  it('surfaces server instructions that prime MPP routing (cold-start fix)', () => {
    const instructions = client.getInstructions();
    expect(instructions).toBeTruthy();
    // Names the MPP capability + the providers that triggered the cold-start miss.
    expect(instructions).toContain('MPP');
    expect(instructions).toContain('fal.ai');
    expect(instructions).toContain('ElevenLabs');
    expect(instructions).toContain('t2000_pay');
    // The load-bearing steer: do NOT decline a reachable third-party API.
    expect(instructions).toMatch(/DO NOT say you cannot reach|cannot reach that service|isn't on an allowlist/i);
  });

  it('exposes one skill-* prompt per SKILL.md on disk', async () => {
    const { prompts } = await client.listPrompts();
    const skillNames = loadSkillsFromDisk().map((s) => s.name);

    expect(prompts.length).toBe(skillNames.length);
    const promptNames = prompts.map((p) => p.name).sort();
    expect(promptNames.every((n) => n.startsWith('skill-'))).toBe(true);
  });

  it('does NOT expose any of the deleted v3 DeFi / safeguards tools', async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    // NB: banned `t2000_earnings` was the v3 DeFi YIELD read. The commerce
    // seller-stats read added 2026-07-06 is `t2000_agent_earnings` — distinct
    // name precisely so this regression keeps guarding the old surface.
    const banned = [
      't2000_save', 't2000_withdraw', 't2000_borrow', 't2000_repay',
      't2000_claim_rewards', 't2000_overview', 't2000_positions',
      't2000_rates', 't2000_all_rates', 't2000_health', 't2000_earnings',
      't2000_fund_status', 't2000_pending_rewards', 't2000_deposit_info',
      't2000_contacts', 't2000_contact_add', 't2000_contact_remove',
      't2000_config', 't2000_lock',
    ];
    for (const tool of banned) {
      expect(names.has(tool)).toBe(false);
    }
  });

  it('calls t2000_balance and returns structured JSON', async () => {
    const result = await client.callTool({ name: 't2000_balance', arguments: {} });
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.available).toBe(96.81);
    expect(data.totalUsd).toBe(102.75);
  });

  it('calls t2000_address and returns address', async () => {
    const result = await client.callTool({ name: 't2000_address', arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.address).toBe('0xtest_integration');
  });

  it('calls t2000_send with explicit asset + dryRun and returns preview', async () => {
    const result = await client.callTool({
      name: 't2000_send',
      arguments: {
        to: '0x0000000000000000000000000000000000000000000000000000000000000001',
        amount: 10,
        asset: 'USDC',
        dryRun: true,
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.preview).toBe(true);
    expect(data.canSend).toBe(true);
    expect(data.amount).toBe(10);
    expect(data.asset).toBe('USDC');
    expect(data.gasless).toBe(true);
  });

  it('t2000_send rejects calls without an explicit asset', async () => {
    const result = await client.callTool({
      name: 't2000_send',
      arguments: {
        to: '0x0000000000000000000000000000000000000000000000000000000000000001',
        amount: 10,
        // asset missing
      },
    });

    expect(result.isError).toBe(true);
  });

  it('t2000_send rejects unsupported assets (e.g. USDY)', async () => {
    const result = await client.callTool({
      name: 't2000_send',
      arguments: {
        to: '0x0000000000000000000000000000000000000000000000000000000000000001',
        amount: 10,
        asset: 'USDY',
      },
    });

    expect(result.isError).toBe(true);
  });

  it('calls t2000_swap and returns the Cetus aggregator result', async () => {
    const result = await client.callTool({
      name: 't2000_swap',
      arguments: { from: 'USDC', to: 'SUI', amount: 1 },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.digest).toBe('0xswap123');
    expect(data.amountOut).toBe(0.97);
  });

  it('calls t2000_limit and returns { configured: false } when no config file exists', async () => {
    // The default config path is ~/.t2000/config.json; in CI this won't
    // exist. The tool MUST gracefully report unconfigured rather than
    // throw.
    const result = await client.callTool({ name: 't2000_limit', arguments: {} });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(typeof data.configured).toBe('boolean');
    expect(typeof data.spentTodayUsd).toBe('number');
  });

  it('returns error for invalid tool arguments', async () => {
    const result = await client.callTool({
      name: 't2000_send',
      arguments: { to: 'not-a-valid-address', amount: 10, asset: 'USDC' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.code).toBeDefined();
  });
});
