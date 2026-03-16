import { describe, it, expect } from 'vitest';
import { createToolRegistry, toolsToLLMFormat, getDryRunHandler } from './tools.js';

describe('Tool Registry', () => {
  const tools = createToolRegistry();

  it('creates a non-empty tool registry', () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it('registers at least 20 tools', () => {
    expect(tools.length).toBeGreaterThanOrEqual(20);
  });

  it('every tool has required fields', () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.schema).toBeTruthy();
      expect(typeof tool.handler).toBe('function');
      expect(typeof tool.stateChanging).toBe('boolean');
    }
  });

  it('tool names are unique', () => {
    const names = tools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all tool names start with t2000_', () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^t2000_/);
    }
  });

  it('read-only tools are not state-changing', () => {
    const readTools = ['t2000_balance', 't2000_address', 't2000_positions', 't2000_rates', 't2000_health', 't2000_history', 't2000_earnings', 't2000_contacts', 't2000_portfolio'];
    for (const name of readTools) {
      const tool = tools.find(t => t.name === name);
      expect(tool, `${name} should exist`).toBeTruthy();
      expect(tool!.stateChanging, `${name} should not be state-changing`).toBe(false);
    }
  });

  it('write tools are state-changing', () => {
    const writeTools = ['t2000_send', 't2000_save', 't2000_withdraw', 't2000_borrow', 't2000_repay', 't2000_exchange', 't2000_invest', 't2000_invest_rebalance', 't2000_rebalance', 't2000_claim_rewards'];
    for (const name of writeTools) {
      const tool = tools.find(t => t.name === name);
      expect(tool, `${name} should exist`).toBeTruthy();
      expect(tool!.stateChanging, `${name} should be state-changing`).toBe(true);
    }
  });
});

describe('toolsToLLMFormat', () => {
  const tools = createToolRegistry();
  const llmTools = toolsToLLMFormat(tools);

  it('converts all tools to LLM format', () => {
    expect(llmTools.length).toBe(tools.length);
  });

  it('every LLM tool has name, description, and parameters', () => {
    for (const tool of llmTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeTruthy();
      expect(typeof tool.parameters).toBe('object');
    }
  });

  it('parameters have type "object" at root', () => {
    for (const tool of llmTools) {
      expect((tool.parameters as Record<string, unknown>).type).toBe('object');
    }
  });

  it('preserves tool names from registry', () => {
    const registryNames = tools.map(t => t.name).sort();
    const llmNames = llmTools.map(t => t.name).sort();
    expect(llmNames).toEqual(registryNames);
  });
});

describe('getDryRunHandler', () => {
  const tools = createToolRegistry();

  it('returns null for read-only tools', () => {
    const balance = tools.find(t => t.name === 't2000_balance')!;
    expect(getDryRunHandler(balance)).toBeNull();
  });

  it('returns a handler for t2000_send', () => {
    const send = tools.find(t => t.name === 't2000_send')!;
    expect(getDryRunHandler(send)).toBeTruthy();
    expect(typeof getDryRunHandler(send)).toBe('function');
  });

  it('returns a handler for t2000_exchange', () => {
    const exchange = tools.find(t => t.name === 't2000_exchange')!;
    expect(getDryRunHandler(exchange)).toBeTruthy();
  });

  it('returns a handler for t2000_invest_rebalance', () => {
    const rebalance = tools.find(t => t.name === 't2000_invest_rebalance')!;
    expect(getDryRunHandler(rebalance)).toBeTruthy();
  });

  it('returns a handler for t2000_save', () => {
    const save = tools.find(t => t.name === 't2000_save')!;
    expect(getDryRunHandler(save)).toBeTruthy();
  });
});
