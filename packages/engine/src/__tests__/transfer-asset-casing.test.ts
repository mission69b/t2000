import { describe, it, expect, vi } from 'vitest';
import { sendTransferTool } from '../tools/transfer.js';

// SPEC 7 P2.7 soak finding F10 (2026-05-03): send_transfer rejected
// `asset: "USDsui"` and `asset: "USDe"` with "Unsupported asset". Root
// cause: SUPPORTED_ASSETS keys USDe / USDsui are mixed case. The
// pre-fix preflight did `String(input.asset).toUpperCase() in
// SUPPORTED_ASSETS` — "USDSUI" / "USDE" miss those keys. The call()
// path also uppercased before passing to the SDK, where SUPPORTED_ASSETS
// ["USDSUI"] is undefined → ASSET_NOT_SUPPORTED throw.
//
// Fix: route through `normalizeAsset` (already used by NAVI adapter) for
// case-insensitive resolution to canonical keys.

const VALID_RECIPIENT = `0x${'b'.repeat(64)}`;

describe('[F10] send_transfer accepts mixed-case asset symbols', () => {
  describe('preflight', () => {
    it('accepts asset: "USDsui" (mixed case, the original repro)', () => {
      const result = sendTransferTool.preflight!({
        to: VALID_RECIPIENT,
        amount: 1,
        asset: 'USDsui',
      });
      expect(result).toEqual({ valid: true });
    });

    it('accepts asset: "USDSUI" (all caps)', () => {
      const result = sendTransferTool.preflight!({
        to: VALID_RECIPIENT,
        amount: 1,
        asset: 'USDSUI',
      });
      expect(result).toEqual({ valid: true });
    });

    it('accepts asset: "usdsui" (all lower)', () => {
      const result = sendTransferTool.preflight!({
        to: VALID_RECIPIENT,
        amount: 1,
        asset: 'usdsui',
      });
      expect(result).toEqual({ valid: true });
    });

    it('accepts asset: "USDe" (mixed case)', () => {
      const result = sendTransferTool.preflight!({
        to: VALID_RECIPIENT,
        amount: 1,
        asset: 'USDe',
      });
      expect(result).toEqual({ valid: true });
    });

    it('accepts asset: "usde" (all lower)', () => {
      const result = sendTransferTool.preflight!({
        to: VALID_RECIPIENT,
        amount: 1,
        asset: 'usde',
      });
      expect(result).toEqual({ valid: true });
    });

    it('still rejects truly unsupported assets', () => {
      const result = sendTransferTool.preflight!({
        to: VALID_RECIPIENT,
        amount: 1,
        asset: 'FAKE_TOKEN',
      });
      expect(result.valid).toBe(false);
      if (!result.valid && 'error' in result) {
        expect(result.error).toMatch(/Unsupported asset/);
      }
    });

    it('keeps the existing all-uppercase symbols working (USDC, SUI, ETH)', () => {
      for (const asset of ['USDC', 'SUI', 'ETH', 'NAVX', 'WAL', 'GOLD', 'usdc', 'sui']) {
        const result = sendTransferTool.preflight!({
          to: VALID_RECIPIENT,
          amount: 1,
          asset,
        });
        expect(result, `asset=${asset}`).toEqual({ valid: true });
      }
    });
  });

  describe('call() — passes canonical-case key to the SDK', () => {
    type SendArgs = { to: string; amount: number; asset: string };
    type SendResult = {
      success: boolean;
      tx: string;
      amount: number;
      to: string;
      gasCost: number;
      balance: number;
    };

    function makeSendSpy() {
      const spy: ((args: SendArgs) => Promise<SendResult>) & {
        capturedAsset?: string;
      } = vi.fn(async (args: SendArgs) => {
        spy.capturedAsset = args.asset;
        return {
          success: true,
          tx: '0xabc',
          amount: 1,
          to: VALID_RECIPIENT,
          gasCost: 0,
          balance: 100,
        };
      });
      return spy;
    }

    function makeCtx(spy: ReturnType<typeof makeSendSpy>) {
      return {
        walletAddress: `0x${'a'.repeat(64)}`,
        agent: { send: spy },
      } as Parameters<typeof sendTransferTool.call>[1];
    }

    it('routes "USDsui" through to agent.send with asset="USDsui" (preserves mixed case)', async () => {
      const spy = makeSendSpy();
      await sendTransferTool.call(
        { to: VALID_RECIPIENT, amount: 1, asset: 'USDsui' },
        makeCtx(spy),
      );
      expect(spy.capturedAsset).toBe('USDsui');
    });

    it('routes "usdsui" → "USDsui" (canonical resolution)', async () => {
      const spy = makeSendSpy();
      await sendTransferTool.call(
        { to: VALID_RECIPIENT, amount: 1, asset: 'usdsui' },
        makeCtx(spy),
      );
      expect(spy.capturedAsset).toBe('USDsui');
    });

    it('routes "USDE" → "USDe"', async () => {
      const spy = makeSendSpy();
      await sendTransferTool.call(
        { to: VALID_RECIPIENT, amount: 1, asset: 'USDE' },
        makeCtx(spy),
      );
      expect(spy.capturedAsset).toBe('USDe');
    });

    it('defaults to USDC when asset is omitted', async () => {
      const spy = makeSendSpy();
      await sendTransferTool.call({ to: VALID_RECIPIENT, amount: 1 }, makeCtx(spy));
      expect(spy.capturedAsset).toBe('USDC');
    });
  });
});
