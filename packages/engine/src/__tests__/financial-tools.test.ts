import { describe, it, expect } from 'vitest';
import { T2000Error } from '@t2000/sdk';
import { saveDepositTool } from '../tools/save.js';
import { borrowTool } from '../tools/borrow.js';

describe('save_deposit tool', () => {
  it('has USDC-only enforcement in description', () => {
    expect(saveDepositTool.description).toContain('ONLY USDC');
    expect(saveDepositTool.description).toContain('do NOT call this tool');
    expect(saveDepositTool.description).toContain('never auto-chain swap + deposit');
  });

  it('rejects USDT with INVALID_ASSET error', async () => {
    await expect(
      saveDepositTool.call({ amount: 10, asset: 'USDT' }, {}),
    ).rejects.toThrow(T2000Error);

    try {
      await saveDepositTool.call({ amount: 10, asset: 'USDT' }, {});
    } catch (e) {
      expect((e as T2000Error).code).toBe('INVALID_ASSET');
    }
  });

  it('rejects SUI with INVALID_ASSET error', async () => {
    await expect(
      saveDepositTool.call({ amount: 1, asset: 'SUI' }, {}),
    ).rejects.toThrow(T2000Error);
  });

  it('rejects USDe with INVALID_ASSET error', async () => {
    await expect(
      saveDepositTool.call({ amount: 5, asset: 'USDe' }, {}),
    ).rejects.toThrow(T2000Error);
  });

  it('is a write tool with confirm permission', () => {
    expect(saveDepositTool.isReadOnly).toBe(false);
    expect(saveDepositTool.permissionLevel).toBe('confirm');
  });

  it('has asset parameter marked as optional in schema', () => {
    const props = saveDepositTool.jsonSchema.properties as Record<string, { type?: string; description?: string }>;
    expect(props.asset).toBeDefined();
    expect(props.asset.description).toContain('USDC');
    const required = (saveDepositTool.jsonSchema.required ?? []) as string[];
    expect(required).not.toContain('asset');
  });
});

describe('borrow tool', () => {
  it('has USDC-only enforcement in description', () => {
    expect(borrowTool.description).toContain('ONLY USDC');
  });

  it('rejects USDT with INVALID_ASSET error', async () => {
    await expect(
      borrowTool.call({ amount: 10, asset: 'USDT' }, {}),
    ).rejects.toThrow(T2000Error);

    try {
      await borrowTool.call({ amount: 10, asset: 'USDT' }, {});
    } catch (e) {
      expect((e as T2000Error).code).toBe('INVALID_ASSET');
    }
  });

  it('rejects SUI with INVALID_ASSET error', async () => {
    await expect(
      borrowTool.call({ amount: 1, asset: 'SUI' }, {}),
    ).rejects.toThrow(T2000Error);
  });

  it('is a write tool with confirm permission', () => {
    expect(borrowTool.isReadOnly).toBe(false);
    expect(borrowTool.permissionLevel).toBe('confirm');
  });

  it('has asset parameter marked as optional in schema', () => {
    const props = borrowTool.jsonSchema.properties as Record<string, { type?: string; description?: string }>;
    expect(props.asset).toBeDefined();
    const required = (borrowTool.jsonSchema.required ?? []) as string[];
    expect(required).not.toContain('asset');
  });
});
