/**
 * tool-modifiable-fields.ts — Audric Harness Correctness Spec v1.4 / Item 6
 *
 * Per-tool registry of input fields the host UI may let the user modify
 * before approving a `PendingAction`. The engine consults this registry
 * when emitting a `pending_action` event so the client can render an
 * editable control without hard-coding tool names in the UI layer.
 *
 * The plan reserves modification for amount-bearing write tools where the
 * user might want to lower the amount before confirming (e.g. "save $50"
 * → user edits to $30 → engine resumes with the modified input). Tools
 * absent from this registry have no modifiable fields and the UI renders
 * a static "approve / deny" pair.
 */
import type { PendingActionModifiableField } from '../types.js';

/**
 * Tool name → ordered list of modifiable input fields. Order matters for
 * UI rendering — the first entry typically becomes the prominent control.
 */
export const TOOL_MODIFIABLE_FIELDS: Record<string, PendingActionModifiableField[]> = {
  save_deposit: [
    { name: 'amount', kind: 'amount', asset: 'USDC' },
  ],
  withdraw: [
    { name: 'amount', kind: 'amount', asset: 'USDC' },
  ],
  send_transfer: [
    // `amount` first so the UI surfaces it prominently; the recipient
    // address field is also editable in case the user typed the wrong one.
    { name: 'amount', kind: 'amount' },
    { name: 'to', kind: 'address' },
  ],
  swap_execute: [
    { name: 'amount', kind: 'amount' },
  ],
  borrow: [
    { name: 'amount', kind: 'amount', asset: 'USDC' },
  ],
  repay_debt: [
    { name: 'amount', kind: 'amount', asset: 'USDC' },
  ],
  volo_stake: [
    { name: 'amount', kind: 'amount', asset: 'SUI' },
  ],
  volo_unstake: [
    { name: 'amount', kind: 'amount', asset: 'vSUI' },
  ],
};

/**
 * Tools that accept multiple asset types on their amount field. Per the
 * v0.51.0 strategic exception, NAVI lend/borrow flows accept USDC OR USDsui;
 * the registry's hardcoded `asset: 'USDC'` is a default that must be
 * overridden by the actual transaction asset when `input.asset` is set.
 *
 * Other amount-bearing tools are excluded by design:
 *  - `send_transfer` / `swap_execute` — no asset on the amount field
 *    (the UI shows the input-side asset from the tx itself).
 *  - `volo_stake` / `volo_unstake` — hardcoded SUI / vSUI single-asset.
 */
const ASSET_OVERRIDABLE_TOOLS = new Set<string>([
  'save_deposit',
  'withdraw',
  'borrow',
  'repay_debt',
]);

/**
 * Returns the modifiable fields for a tool name, or `undefined` if the tool
 * has no modifiable inputs. Used by the engine when emitting `pending_action`.
 *
 * When `input` is provided AND the tool is one of the asset-overridable
 * NAVI lend/borrow flows, the asset on amount-bearing fields is rewritten
 * to match `input.asset` ('USDC' | 'USDsui'). Without `input`, the
 * registry default ('USDC') is preserved — back-compat for legacy callers.
 *
 * Pre-fix (v2.7.0-): every USDsui save_deposit / borrow / withdraw /
 * repay_debt emitted `modifiableFields[].asset === 'USDC'` regardless of
 * the actual tx asset, so the UI's amount editor labelled USDsui txs as
 * USDC. Surfaced in the 2026-05-18 founder smoke (F-11).
 */
export function getModifiableFields(
  toolName: string,
  input?: unknown,
): PendingActionModifiableField[] | undefined {
  const fields = TOOL_MODIFIABLE_FIELDS[toolName];
  if (!fields) return undefined;
  if (!ASSET_OVERRIDABLE_TOOLS.has(toolName)) return fields;
  if (!input || typeof input !== 'object') return fields;

  const inputAsset = (input as Record<string, unknown>).asset;
  if (inputAsset !== 'USDC' && inputAsset !== 'USDsui') return fields;

  return fields.map((field) =>
    field.kind === 'amount' && field.asset
      ? { ...field, asset: inputAsset }
      : field,
  );
}
