// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// Tests for the pure MCP-platform helpers — covers the install /
// uninstall idempotency invariants without touching disk.

import { describe, it, expect } from 'vitest';
import {
  MCP_SERVER_ENTRY,
  MCP_SERVER_KEY,
  hasMcpEntry,
  withMcpEntry,
  withoutMcpEntry,
} from './platforms.js';

describe('MCP_SERVER_ENTRY', () => {
  it('uses the new t2 binary, not the legacy t2000', () => {
    expect(MCP_SERVER_ENTRY.command).toBe('t2');
    expect(MCP_SERVER_ENTRY.args).toEqual(['mcp', 'start']);
  });

  it('keeps the t2000 key for back-compat (existing installs)', () => {
    expect(MCP_SERVER_KEY).toBe('t2000');
  });
});

describe('hasMcpEntry', () => {
  it('returns false for empty config', () => {
    expect(hasMcpEntry({})).toBe(false);
  });

  it('returns false when mcpServers exists but lacks the t2000 entry', () => {
    expect(hasMcpEntry({ mcpServers: { other: { command: 'foo' } } })).toBe(false);
  });

  it('returns true when the t2000 entry is present', () => {
    expect(hasMcpEntry({ mcpServers: { t2000: { command: 't2', args: ['mcp', 'start'] } } })).toBe(
      true,
    );
  });
});

describe('withMcpEntry', () => {
  it('adds the entry when none exists', () => {
    const result = withMcpEntry({});
    expect(hasMcpEntry(result)).toBe(true);
    expect((result.mcpServers as Record<string, unknown>).t2000).toEqual(MCP_SERVER_ENTRY);
  });

  it('preserves other servers in mcpServers', () => {
    const result = withMcpEntry({ mcpServers: { other: { command: 'foo' } } });
    expect((result.mcpServers as Record<string, unknown>).other).toEqual({ command: 'foo' });
    expect((result.mcpServers as Record<string, unknown>).t2000).toEqual(MCP_SERVER_ENTRY);
  });

  it('is idempotent — overwrites with the canonical entry', () => {
    const stale = { mcpServers: { t2000: { command: 't2000', args: ['mcp'] } } };
    const result = withMcpEntry(stale);
    expect((result.mcpServers as Record<string, unknown>).t2000).toEqual(MCP_SERVER_ENTRY);
  });

  it('preserves unknown top-level keys (does not nuke user config)', () => {
    const result = withMcpEntry({ mcpServers: {}, customField: 'preserved' });
    expect(result.customField).toBe('preserved');
  });
});

describe('withoutMcpEntry', () => {
  it('returns the input unchanged when the entry is absent', () => {
    const input = { mcpServers: { other: { command: 'foo' } } };
    expect(withoutMcpEntry(input)).toBe(input);
  });

  it('returns the input unchanged for empty config', () => {
    const input = {};
    expect(withoutMcpEntry(input)).toBe(input);
  });

  it('removes only the t2000 entry, preserves siblings', () => {
    const input = {
      mcpServers: {
        other: { command: 'foo' },
        t2000: { command: 't2', args: ['mcp', 'start'] },
      },
    };
    const result = withoutMcpEntry(input);
    expect(hasMcpEntry(result)).toBe(false);
    expect((result.mcpServers as Record<string, unknown>).other).toEqual({ command: 'foo' });
  });

  it('preserves unknown top-level keys', () => {
    const result = withoutMcpEntry({
      mcpServers: { t2000: { command: 't2' } },
      customField: 'preserved',
    });
    expect(result.customField).toBe('preserved');
  });
});
