import { describe, it, expect, vi } from 'vitest';
import { McpPromptAdapter, type PromptCapableMcpClient } from './prompt-adapter.js';

// ---------------------------------------------------------------------------
// Test helper — fake MCP client that satisfies PromptCapableMcpClient
// ---------------------------------------------------------------------------

function fakeClient(opts: {
  listPromptsResult?: Awaited<ReturnType<PromptCapableMcpClient['experimental_listPrompts']>>;
  getPromptResult?: Awaited<ReturnType<PromptCapableMcpClient['experimental_getPrompt']>>;
}): PromptCapableMcpClient {
  return {
    experimental_listPrompts: vi.fn(async () => opts.listPromptsResult ?? { prompts: [] }),
    experimental_getPrompt: vi.fn(async () =>
      opts.getPromptResult ?? { messages: [] },
    ),
  } as unknown as PromptCapableMcpClient;
}

// ---------------------------------------------------------------------------
// listPrompts
// ---------------------------------------------------------------------------

describe('McpPromptAdapter.listPrompts', () => {
  it('returns trimmed descriptors for every prompt the server exposes', async () => {
    const client = fakeClient({
      listPromptsResult: {
        prompts: [
          {
            name: 'safe-borrow',
            description: 'Borrow with health-factor preview',
            arguments: [
              { name: 'asset', description: 'USDC or USDsui', required: true },
              { name: 'amountUsd', required: false },
            ],
          },
          { name: 'portfolio-rebalance', description: 'Rebalance across positions' },
        ],
      } as unknown as Awaited<ReturnType<PromptCapableMcpClient['experimental_listPrompts']>>,
    });

    const adapter = new McpPromptAdapter(client);
    const prompts = await adapter.listPrompts();

    expect(prompts).toEqual([
      {
        name: 'safe-borrow',
        description: 'Borrow with health-factor preview',
        arguments: [
          { name: 'asset', description: 'USDC or USDsui', required: true },
          { name: 'amountUsd', description: undefined, required: false },
        ],
      },
      {
        name: 'portfolio-rebalance',
        description: 'Rebalance across positions',
        arguments: undefined,
      },
    ]);
  });

  it('returns an empty array when the server exposes no prompts', async () => {
    const client = fakeClient({ listPromptsResult: { prompts: [] } as unknown as Awaited<ReturnType<PromptCapableMcpClient['experimental_listPrompts']>> });
    const adapter = new McpPromptAdapter(client);
    expect(await adapter.listPrompts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getPromptText
// ---------------------------------------------------------------------------

describe('McpPromptAdapter.getPromptText', () => {
  it('joins text-content messages with a blank line', async () => {
    const client = fakeClient({
      getPromptResult: {
        messages: [
          { role: 'system', content: { type: 'text', text: 'You are a careful borrower.' } },
          { role: 'user', content: { type: 'text', text: 'Always check HF first.' } },
        ],
      } as unknown as Awaited<ReturnType<PromptCapableMcpClient['experimental_getPrompt']>>,
    });

    const adapter = new McpPromptAdapter(client);
    const text = await adapter.getPromptText({ name: 'safe-borrow' });

    expect(text).toBe('You are a careful borrower.\n\nAlways check HF first.');
  });

  it('drops non-text content silently (image / resource / resource_link)', async () => {
    const client = fakeClient({
      getPromptResult: {
        messages: [
          { role: 'system', content: { type: 'text', text: 'Pre-amble.' } },
          { role: 'user', content: { type: 'image', data: 'base64...', mimeType: 'image/png' } },
          {
            role: 'user',
            content: {
              type: 'resource',
              resource: { uri: 'navi://pools', mimeType: 'application/json', text: '{...}' },
            },
          },
          {
            role: 'user',
            content: { type: 'resource_link', uri: 'navi://docs', name: 'NAVI docs' },
          },
          { role: 'user', content: { type: 'text', text: 'Post-amble.' } },
        ],
      } as unknown as Awaited<ReturnType<PromptCapableMcpClient['experimental_getPrompt']>>,
    });

    const adapter = new McpPromptAdapter(client);
    const text = await adapter.getPromptText({ name: 'mixed-content' });

    expect(text).toBe('Pre-amble.\n\nPost-amble.');
  });

  it('forwards name + arguments to experimental_getPrompt verbatim', async () => {
    const client = fakeClient({
      getPromptResult: { messages: [] } as unknown as Awaited<ReturnType<PromptCapableMcpClient['experimental_getPrompt']>>,
    });

    const adapter = new McpPromptAdapter(client);
    await adapter.getPromptText({
      name: 'safe-borrow',
      arguments: { asset: 'USDC', amountUsd: 250 },
    });

    expect(client.experimental_getPrompt).toHaveBeenCalledWith({
      name: 'safe-borrow',
      arguments: { asset: 'USDC', amountUsd: 250 },
    });
  });

  it('returns an empty string when the prompt yields zero messages', async () => {
    const client = fakeClient({
      getPromptResult: { messages: [] } as unknown as Awaited<ReturnType<PromptCapableMcpClient['experimental_getPrompt']>>,
    });
    const adapter = new McpPromptAdapter(client);
    expect(await adapter.getPromptText({ name: 'empty' })).toBe('');
  });
});
