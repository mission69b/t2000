import { describe, it, expect } from 'vitest';
import { withdrawTool } from '../tools/withdraw.js';

// SPEC 7 P2.7 soak finding F8 (2026-05-02): the pre-fix description claimed
// "Legacy positions in other assets (USDe, SUI) can still be withdrawn if
// the user has them" — true for the SDK single-write path but FALSE for the
// bundled write path (composeTx.WriteStep['withdraw'].input.asset is
// constrained to 'USDC' | 'USDsui'). The LLM bundled the legacy positions
// in good faith and the bundle reverted on the second leg.
//
// These contract assertions lock the corrected description so a future
// "while I'm here" edit can't quietly re-introduce the wrong claim.

describe('[F8] withdraw tool description — USDC + USDsui only, no legacy claims', () => {
  it('explicitly lists USDC and USDsui as the only supported assets', () => {
    expect(withdrawTool.description).toMatch(/USDC and USDsui|USDC or USDsui/);
  });

  it('does NOT claim legacy positions (USDe, SUI) are withdrawable via Audric', () => {
    expect(withdrawTool.description).not.toMatch(/Legacy positions[^.]*can still be withdrawn/i);
    expect(withdrawTool.description).not.toMatch(/withdraws.*USDe|USDe.*can be withdrawn/i);
  });

  it('points users at NAVI\u2019s app for non-canonical positions', () => {
    expect(withdrawTool.description).toMatch(/naviprotocol\.io|NAVI'?s? app/);
  });

  it('keeps the Payment Stream bundleable hint intact', () => {
    expect(withdrawTool.description).toMatch(/Payment Stream/);
    expect(withdrawTool.description).toMatch(/bundleable/);
  });

  it('asset jsonSchema description constrains to USDC + USDsui', () => {
    const props = withdrawTool.jsonSchema.properties as Record<string, { description?: string }>;
    expect(props.asset?.description).toMatch(/USDC.*USDsui/);
    expect(props.asset?.description).not.toMatch(/USDe|SUI/);
  });
});
