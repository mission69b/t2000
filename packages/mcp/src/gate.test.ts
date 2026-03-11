import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./unlock.js', () => ({
  createAgent: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: vi.fn(),
    prompt: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

import { createAgent } from './unlock.js';

describe('safeguard gate', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    vi.resetModules();
  });

  it('exits with code 1 when safeguards are not configured', async () => {
    vi.mocked(createAgent).mockResolvedValue({
      enforcer: {
        isConfigured: vi.fn().mockReturnValue(false),
      },
    } as any);

    const { startMcpServer } = await import('./index.js');
    await startMcpServer();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Safeguards not configured'),
    );
  });

  it('does not exit when safeguards are configured', async () => {
    vi.mocked(createAgent).mockResolvedValue({
      enforcer: {
        isConfigured: vi.fn().mockReturnValue(true),
      },
    } as any);

    const { startMcpServer } = await import('./index.js');
    await startMcpServer();

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('passes keyPath option to createAgent', async () => {
    vi.mocked(createAgent).mockResolvedValue({
      enforcer: {
        isConfigured: vi.fn().mockReturnValue(true),
      },
    } as any);

    const { startMcpServer } = await import('./index.js');
    await startMcpServer({ keyPath: '/custom/key.json' });

    expect(createAgent).toHaveBeenCalledWith('/custom/key.json');
  });
});
