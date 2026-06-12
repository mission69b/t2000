// ---------------------------------------------------------------------------
// compose-bundle.test.ts — bundle composition invariants
// ---------------------------------------------------------------------------
//
// Focused on the load-bearing fields exposed by `composeBundleFromToolResults`.
// This test is intentionally NARROW: it does not re-litigate every SPEC 7 v0.4
// Layer 2 behavior (those have integration tests elsewhere). It pins the
// invariants that touch the D-6.1 `approvalId` alias contract introduced
// 2026-05-18 per SPEC_SLICE_D_DRAFT.md §7.
//
// Why this test exists
// --------------------
// D-6.1 adds an optional `approvalId: string` field on `PendingAction` and
// `PendingActionStep` that mirrors `attemptId` 1:1 at every emission site.
// The contract is:
//
//   1. `step.attemptId === step.approvalId` (every step)
//   2. `action.attemptId === action.approvalId` (top-level)
//   3. `action.attemptId === action.steps[0].attemptId` (bundle mirroring)
//   4. `action.approvalId === action.steps[0].approvalId` (bundle mirroring)
//   5. `steps[i].attemptId !== steps[j].attemptId` for i !== j (per-step uniqueness)
//
// All five hold by construction because both ids come from a single
// `randomUUID()` call per step. This test pins that invariant so a future
// edit that accidentally generates two UUIDs (re-introducing potential
// drift between attemptId and approvalId) fails CI immediately.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { composeBundleFromToolResults } from './compose-bundle.js';
import { defineToolForTest as defineTool } from './__tests__/_helpers/call-tool-body.js';
import type { PendingToolCall } from './types.js';

const noopCall = async () => ({ ok: true as const, data: {} });

// Use the names of two real bundleable tools (the helper looks up
// `bundleable: true` on each registered tool via `tool-flags.ts`).
// [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] save_deposit was deleted;
// repay_debt is the surviving bundleable consumer with the same shape.
const repayDebtMock = defineTool({
  name: 'repay_debt',
  description: 'mock repay_debt for bundle composition test',
  inputSchema: z.object({ amount: z.number(), asset: z.string() }),
  call: noopCall,
  isReadOnly: false,
  flags: { mutating: true, bundleable: true },
});

const sendTransferMock = defineTool({
  name: 'send_transfer',
  description: 'mock send_transfer for bundle composition test',
  inputSchema: z.object({
    amount: z.number(),
    asset: z.string(),
    to: z.string(),
  }),
  call: noopCall,
  isReadOnly: false,
  flags: { mutating: true, bundleable: true },
});

// composeBundleFromToolResults no longer takes a `tools` arg
// (P4.1 Phase C — it reads bundleable flag from the central registry by
// tool name). Keep the stubs alive so the policy registry is updated by
// `defineToolForTest`'s side effect at module load.
void repayDebtMock;
void sendTransferMock;

const pendingWrites: PendingToolCall[] = [
  {
    id: 'toolu_repay_1',
    name: 'repay_debt',
    input: { amount: 10, asset: 'USDC' },
  },
  {
    id: 'toolu_send_2',
    name: 'send_transfer',
    input: { amount: 5, asset: 'USDC', to: '0x1234' },
  },
];

describe('composeBundleFromToolResults — D-6.1 approvalId alias invariant', () => {
  it('mirrors attemptId 1:1 on every step and at top level', () => {
    const action = composeBundleFromToolResults({
      pendingWrites,
      readResults: [],
      assistantContent: [],
      completedResults: [],
      turnIndex: 0,
    });

    // (1) Every step has approvalId === attemptId
    for (const step of action.steps ?? []) {
      expect(step.approvalId).toBeDefined();
      expect(step.approvalId).toBe(step.attemptId);
    }

    // (2) Top-level approvalId === attemptId
    expect(action.approvalId).toBeDefined();
    expect(action.approvalId).toBe(action.attemptId);

    // (3) Top-level attemptId mirrors steps[0].attemptId (existing SPEC 7
    //     bundle mirror, re-checked here to make the alias rule explicit).
    expect(action.attemptId).toBe(action.steps![0].attemptId);

    // (4) Top-level approvalId mirrors steps[0].approvalId
    expect(action.approvalId).toBe(action.steps![0].approvalId);

    // (5) Per-step attemptIds are unique (no accidental ID reuse)
    const stepIds = (action.steps ?? []).map((s) => s.attemptId);
    const uniqueIds = new Set(stepIds);
    expect(uniqueIds.size).toBe(stepIds.length);
  });

  it('uses valid UUID v4 format for both fields', () => {
    const action = composeBundleFromToolResults({
      pendingWrites,
      readResults: [],
      assistantContent: [],
      completedResults: [],
      turnIndex: 0,
    });

    // Loose UUID v4 shape check — 8-4-4-4-12 hex with version bit 4.
    // Matches the output of `node:crypto.randomUUID()` exactly.
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    expect(action.attemptId).toMatch(uuidV4);
    expect(action.approvalId).toMatch(uuidV4);

    for (const step of action.steps ?? []) {
      expect(step.attemptId).toMatch(uuidV4);
      expect(step.approvalId).toMatch(uuidV4);
    }
  });
});

// ---------------------------------------------------------------------------
// SPEC_AI_SDK_HARDENING P7.2 — inputCoinFromStep population invariant
// ---------------------------------------------------------------------------
//
// `composeBundleFromToolResults` must populate `step.inputCoinFromStep = i - 1`
// for adjacent steps whose (producer, consumer) pair is in `VALID_PAIRS`
// AND whose producer-output asset aligns with consumer-input asset
// (`shouldChainCoin`). The audric host marker layer then forwards this
// field through to the SDK's `composeTx.WriteStep[]` so chain-mode
// coin-handoff actually fires on-chain.
//
// Without this, chained-asset bundles fall back to wallet-mode pre-fetches
// that fail for assets not yet in the wallet (e.g. `swap_execute(USDC →
// USDsui) → repay_debt(USDsui)` reverts at PREPARE because USDsui
// isn't already in the wallet — the swap's output hasn't transferred yet).
//
// Pinning this invariant here catches the regression at the source. The
// host-side plumbing (chat route marker assembly → audric-chat-client
// dispatch → /api/transactions/prepare bundleStepSchema →
// buildBundleSteps) is structurally pass-through and trusted via
// typecheck.
// ---------------------------------------------------------------------------

const withdrawMock = defineTool({
  name: 'withdraw',
  description: 'mock withdraw for chain-mode test',
  inputSchema: z.object({ amount: z.number(), asset: z.string() }),
  call: noopCall,
  isReadOnly: false,
  flags: { mutating: true, bundleable: true },
});

const swapExecuteMock = defineTool({
  name: 'swap_execute',
  description: 'mock swap_execute for chain-mode test',
  inputSchema: z.object({
    from: z.string(),
    to: z.string(),
    amount: z.number(),
  }),
  call: noopCall,
  isReadOnly: false,
  flags: { mutating: true, bundleable: true },
});

void withdrawMock;
void swapExecuteMock;

describe('composeBundleFromToolResults — P7.2 chain-mode inputCoinFromStep', () => {
  it('populates inputCoinFromStep on consumer for whitelisted, asset-aligned pair', () => {
    // `swap_execute(USDC → USDsui) → repay_debt(USDsui)` — the
    // surviving chained-asset shape (exit-window repay symmetry; the
    // original SPEC 13 motivator `swap → save_deposit` left with the
    // DeFi removal).
    const action = composeBundleFromToolResults({
      pendingWrites: [
        {
          id: 'toolu_swap_1',
          name: 'swap_execute',
          input: { from: 'USDC', to: 'USDsui', amount: 50 },
        },
        {
          id: 'toolu_repay_2',
          name: 'repay_debt',
          input: { amount: 50, asset: 'USDsui' },
        },
      ],
      readResults: [],
      assistantContent: [],
      completedResults: [],
      turnIndex: 0,
    });

    expect(action.steps?.[0].inputCoinFromStep).toBeUndefined();
    expect(action.steps?.[1].inputCoinFromStep).toBe(0);
  });

  it('does NOT populate inputCoinFromStep when assets misalign', () => {
    // `withdraw(USDC) → swap_execute(SUI → USDC)` — pair IS in the
    // whitelist (`withdraw → swap_execute`) but the swap's `from: SUI`
    // doesn't match withdraw's USDC output. Chain mode must NOT fire.
    const action = composeBundleFromToolResults({
      pendingWrites: [
        {
          id: 'toolu_wd_1',
          name: 'withdraw',
          input: { amount: 10, asset: 'USDC' },
        },
        {
          id: 'toolu_swap_2',
          name: 'swap_execute',
          input: { from: 'SUI', to: 'USDC', amount: 1 },
        },
      ],
      readResults: [],
      assistantContent: [],
      completedResults: [],
      turnIndex: 0,
    });

    expect(action.steps?.[0].inputCoinFromStep).toBeUndefined();
    expect(action.steps?.[1].inputCoinFromStep).toBeUndefined();
  });

  it('does NOT populate inputCoinFromStep for non-whitelisted pair', () => {
    // `repay_debt → send_transfer` — not in `VALID_PAIRS` (repay is
    // not a producer in the whitelist). Same-asset (USDC) but pair is
    // outside the safe set, so chain mode must not fire.
    const action = composeBundleFromToolResults({
      pendingWrites: [
        {
          id: 'toolu_repay_1',
          name: 'repay_debt',
          input: { amount: 10, asset: 'USDC' },
        },
        {
          id: 'toolu_send_2',
          name: 'send_transfer',
          input: { amount: 5, asset: 'USDC', to: '0x1234' },
        },
      ],
      readResults: [],
      assistantContent: [],
      completedResults: [],
      turnIndex: 0,
    });

    expect(action.steps?.[0].inputCoinFromStep).toBeUndefined();
    expect(action.steps?.[1].inputCoinFromStep).toBeUndefined();
  });

  it('populates inputCoinFromStep across multiple chained pairs in a 3-op DAG', () => {
    // `withdraw(USDC) → swap_execute(USDC → SUI) → send_transfer(SUI)`
    // — both adjacent pairs are whitelisted AND asset-aligned. SPEC 13
    // Phase 2 raised the cap to 3 specifically for this shape; SPEC 13
    // Phase 3a (1.15.0) raised it to 4 with DAG-aware semantics.
    const action = composeBundleFromToolResults({
      pendingWrites: [
        {
          id: 'toolu_wd_1',
          name: 'withdraw',
          input: { amount: 10, asset: 'USDC' },
        },
        {
          id: 'toolu_swap_2',
          name: 'swap_execute',
          input: { from: 'USDC', to: 'SUI', amount: 10 },
        },
        {
          id: 'toolu_send_3',
          name: 'send_transfer',
          input: { amount: 1, asset: 'SUI', to: '0x1234' },
        },
      ],
      readResults: [],
      assistantContent: [],
      completedResults: [],
      turnIndex: 0,
    });

    expect(action.steps?.[0].inputCoinFromStep).toBeUndefined();
    expect(action.steps?.[1].inputCoinFromStep).toBe(0);
    expect(action.steps?.[2].inputCoinFromStep).toBe(1);
  });

  it('forward-only reference: every populated value is < its step index', () => {
    // Defensive against a future refactor that accidentally introduces
    // backward references — the SDK's `composeTx` would throw
    // `CHAIN_MODE_INVALID` but pinning here surfaces the regression at
    // the engine-test layer.
    const action = composeBundleFromToolResults({
      pendingWrites: [
        {
          id: 'toolu_wd_1',
          name: 'withdraw',
          input: { amount: 10, asset: 'USDC' },
        },
        {
          id: 'toolu_swap_2',
          name: 'swap_execute',
          input: { from: 'USDC', to: 'SUI', amount: 10 },
        },
        {
          id: 'toolu_send_3',
          name: 'send_transfer',
          input: { amount: 1, asset: 'SUI', to: '0x1234' },
        },
      ],
      readResults: [],
      assistantContent: [],
      completedResults: [],
      turnIndex: 0,
    });

    for (let i = 0; i < (action.steps?.length ?? 0); i++) {
      const ref = action.steps?.[i].inputCoinFromStep;
      if (typeof ref === 'number') {
        expect(ref).toBeGreaterThanOrEqual(0);
        expect(ref).toBeLessThan(i);
      }
    }
  });
});
