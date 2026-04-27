import { describe, it, expect } from 'vitest';
import { T2000Error } from '@t2000/sdk';
import { saveDepositTool } from '../tools/save.js';
import { borrowTool } from '../tools/borrow.js';

// [v0.51.0] save_deposit and borrow now accept USDC OR USDsui (strategic
// exception — see .cursor/rules/savings-usdc-only.mdc). Every other asset must
// still be rejected. The Zod schema ships an `enum` so TypeScript also blocks
// disallowed assets at compile time. The runtime allow-list is enforced by
// `assertAllowedAsset('save'|'borrow', asset)` in @t2000/sdk.
describe('save_deposit tool', () => {
  it('description names both saveable assets and the auto-chain prohibition', () => {
    expect(saveDepositTool.description).toContain('USDC or USDsui');
    expect(saveDepositTool.description).toContain('do NOT call this tool');
    expect(saveDepositTool.description).toContain('never auto-chain');
  });

  it('runtime preflight rejects USDT', async () => {
    // Cast through `unknown` because the Zod schema would catch this at
    // compile time — the test exists to verify the runtime guard is also
    // wired up (defense in depth for the LLM bypassing the schema).
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = saveDepositTool.preflight?.(badInput);
    expect(result?.valid).toBe(false);
    if (result && !result.valid) expect(result.error).toContain('USDC or USDsui');
  });

  it('runtime preflight rejects SUI', async () => {
    const badInput = { amount: 1, asset: 'SUI' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = saveDepositTool.preflight?.(badInput);
    expect(result?.valid).toBe(false);
  });

  it('runtime preflight rejects USDe (other stable still blocked)', async () => {
    const badInput = { amount: 5, asset: 'USDe' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = saveDepositTool.preflight?.(badInput);
    expect(result?.valid).toBe(false);
  });

  it('SDK assertAllowedAsset rejects USDT at call() — backstop after preflight', async () => {
    // If the LLM somehow bypassed both the JSON schema enum AND the
    // preflight, the SDK still throws T2000Error('INVALID_ASSET').
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    await expect(saveDepositTool.call(badInput, {})).rejects.toThrow(T2000Error);
    try {
      await saveDepositTool.call(badInput, {});
    } catch (e) {
      expect((e as T2000Error).code).toBe('INVALID_ASSET');
    }
  });

  it('preflight accepts USDC', () => {
    expect(saveDepositTool.preflight?.({ amount: 10, asset: 'USDC' })).toEqual({ valid: true });
  });

  it('preflight accepts USDsui (strategic exception)', () => {
    expect(saveDepositTool.preflight?.({ amount: 10, asset: 'USDsui' })).toEqual({ valid: true });
  });

  it('preflight accepts omitted asset (defaults to USDC)', () => {
    expect(saveDepositTool.preflight?.({ amount: 10 })).toEqual({ valid: true });
  });

  it('is a write tool with confirm permission', () => {
    expect(saveDepositTool.isReadOnly).toBe(false);
    expect(saveDepositTool.permissionLevel).toBe('confirm');
  });

  it('asset parameter is optional in schema and enum-constrained', () => {
    const props = saveDepositTool.jsonSchema.properties as Record<string, { type?: string; description?: string; enum?: string[] }>;
    expect(props.asset).toBeDefined();
    expect(props.asset.enum).toEqual(['USDC', 'USDsui']);
    const required = (saveDepositTool.jsonSchema.required ?? []) as string[];
    expect(required).not.toContain('asset');
  });
});

describe('borrow tool', () => {
  it('description names both borrowable assets', () => {
    expect(borrowTool.description).toContain('USDC or USDsui');
  });

  it('runtime preflight rejects USDT', async () => {
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = borrowTool.preflight?.(badInput);
    expect(result?.valid).toBe(false);
    if (result && !result.valid) expect(result.error).toContain('USDC or USDsui');
  });

  it('runtime preflight rejects SUI', async () => {
    const badInput = { amount: 1, asset: 'SUI' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = borrowTool.preflight?.(badInput);
    expect(result?.valid).toBe(false);
  });

  it('SDK assertAllowedAsset rejects USDT at call() — backstop after preflight', async () => {
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    await expect(borrowTool.call(badInput, {})).rejects.toThrow(T2000Error);
    try {
      await borrowTool.call(badInput, {});
    } catch (e) {
      expect((e as T2000Error).code).toBe('INVALID_ASSET');
    }
  });

  it('preflight accepts USDC and USDsui', () => {
    expect(borrowTool.preflight?.({ amount: 10, asset: 'USDC' })).toEqual({ valid: true });
    expect(borrowTool.preflight?.({ amount: 10, asset: 'USDsui' })).toEqual({ valid: true });
  });

  it('is a write tool with confirm permission', () => {
    expect(borrowTool.isReadOnly).toBe(false);
    expect(borrowTool.permissionLevel).toBe('confirm');
  });

  it('asset parameter is optional in schema and enum-constrained', () => {
    const props = borrowTool.jsonSchema.properties as Record<string, { type?: string; description?: string; enum?: string[] }>;
    expect(props.asset).toBeDefined();
    expect(props.asset.enum).toEqual(['USDC', 'USDsui']);
    const required = (borrowTool.jsonSchema.required ?? []) as string[];
    expect(required).not.toContain('asset');
  });
});
