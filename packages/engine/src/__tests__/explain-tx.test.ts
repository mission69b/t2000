import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { explainTxTool } from '../tools/explain-tx.js';
import type { ToolContext } from '../types.js';

/**
 * Bug C regression coverage: the EXPLAIN TRANSACTION card was rendering
 * raw on-chain Move type segments (e.g. `0x...::cert::CERT` → "CERT")
 * instead of the user-facing token symbol ("vSUI"). The fix routes
 * symbols through `resolveSymbol()` from the canonical token registry.
 *
 * These tests stub `fetch` directly so we don't need an MCP/RPC harness —
 * the tool talks to Sui RPC itself and we only care about the symbol
 * mapping in the rendered effects.
 */
const VSUI_TYPE =
  '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT';
const SUI_TYPE = '0x2::sui::SUI';
const CLAIMER = '0x7f20593c000000000000000000000000000000000000000000000000000000ff';

function mockFetchOnce(rpcResult: Record<string, unknown>) {
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ result: rpcResult }), { status: 200 }),
  ) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe('explain_tx tool — symbol resolution (Bug C)', () => {
  let restoreFetch: (() => void) | null = null;

  afterEach(() => {
    if (restoreFetch) {
      restoreFetch();
      restoreFetch = null;
    }
    vi.restoreAllMocks();
  });

  it('renders vSUI (not CERT) for vSUI claim balance changes', async () => {
    restoreFetch = mockFetchOnce({
      transaction: { data: { sender: CLAIMER, gasData: { owner: CLAIMER } } },
      effects: {
        status: { status: 'success' },
        gasUsed: { computationCost: '1000000', storageCost: '500000', storageRebate: '0' },
      },
      balanceChanges: [
        { owner: { AddressOwner: CLAIMER }, coinType: VSUI_TYPE, amount: '16500000' }, // 0.0165 vSUI
      ],
      events: [],
      timestampMs: '1745000000000',
    });

    const result = await explainTxTool.call(
      { digest: 'CwTo4jy3aaabbbbccccddddeeeeffffgggghhhhiiiijjjjkkkk' },
      {} as ToolContext,
    );

    const data = result.data as { effects: Array<{ type: string; description: string }>; summary: string };

    expect(data.effects).toHaveLength(1);
    expect(data.effects[0].description).toContain('vSUI');
    expect(data.effects[0].description).not.toContain(' CERT');
    expect(data.summary).toContain('vSUI');
    expect(result.displayText).toContain('vSUI');
  });

  it('still renders SUI correctly for native SUI transfers', async () => {
    restoreFetch = mockFetchOnce({
      transaction: { data: { sender: CLAIMER, gasData: { owner: CLAIMER } } },
      effects: {
        status: { status: 'success' },
        gasUsed: { computationCost: '1000000', storageCost: '500000', storageRebate: '0' },
      },
      balanceChanges: [
        { owner: { AddressOwner: CLAIMER }, coinType: SUI_TYPE, amount: '1000000000' }, // +1 SUI received
      ],
      events: [],
      timestampMs: '1745000000000',
    });

    const result = await explainTxTool.call(
      { digest: 'aaabbbbccccddddeeeeffffgggghhhhiiiijjjjkkkkllllmmmm' },
      {} as ToolContext,
    );

    const data = result.data as { effects: Array<{ description: string }> };
    expect(data.effects[0].description).toContain('SUI');
  });

  it('falls back to last `::` segment for unknown coin types', async () => {
    restoreFetch = mockFetchOnce({
      transaction: { data: { sender: CLAIMER, gasData: { owner: CLAIMER } } },
      effects: {
        status: { status: 'success' },
        gasUsed: { computationCost: '0', storageCost: '0', storageRebate: '0' },
      },
      balanceChanges: [
        { owner: { AddressOwner: CLAIMER }, coinType: '0xdeadbeef::custom::MYSTERYTOKEN', amount: '1000000000' },
      ],
      events: [],
      timestampMs: '1745000000000',
    });

    const result = await explainTxTool.call(
      { digest: 'beefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef' },
      {} as ToolContext,
    );

    const data = result.data as { effects: Array<{ description: string }> };
    expect(data.effects[0].description).toContain('MYSTERYTOKEN');
  });
});
