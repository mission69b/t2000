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
 * Returns the modifiable fields for a tool name, or `undefined` if the tool
 * has no modifiable inputs. Used by the engine when emitting `pending_action`.
 */
export function getModifiableFields(
  toolName: string,
): PendingActionModifiableField[] | undefined {
  return TOOL_MODIFIABLE_FIELDS[toolName];
}
