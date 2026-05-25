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
const saveDepositMock = defineTool({
  name: 'save_deposit',
  description: 'mock save_deposit for bundle composition test',
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
void saveDepositMock;
void sendTransferMock;

const pendingWrites: PendingToolCall[] = [
  {
    id: 'toolu_save_1',
    name: 'save_deposit',
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
