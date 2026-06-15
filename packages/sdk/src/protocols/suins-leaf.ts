/**
 * SuiNS leaf-subname builders for the `audric.sui` parent NFT.
 *
 * Used by SPEC 10 v0.2.1 Phase A.1 — Audric Passport Identity. Lets the audric host
 * mint and revoke `username.audric.sui` leaves under the parent NFT held by the
 * dedicated custody address (`0xaca29165…23d11`).
 *
 * **Why a dedicated SDK module (not inline in the audric route):**
 *  - Consumers (audric/web's `/api/identity/{reserve,change,release}` routes) can import
 *    the canonical builder shape without re-discovering the `SuinsTransaction` API.
 *  - Single source of truth for the parent NFT ID + parent name.
 *  - Single source of truth for label validation (length / charset / hyphen rules).
 *
 * **Signer model — read this before wiring into a route:**
 *  These builders are signed by the **service account** (the parent NFT custody address),
 *  NOT by the user's zkLogin key. Per `audric/.cursor/rules/audric-canonical-write.mdc`,
 *  the SPEC 10 leaf-mint API routes are explicitly documented as a CANONICAL-BYPASS of
 *  the `composeTx` write contract — they are server-to-server, the user's key is never
 *  in the loop, and Enoki sponsors the gas. PTB atomicity requires single-signer, so
 *  leaf mints cannot be bundled with chat-agent writes via composeTx.
 *
 * **Reference:** `spec/runbooks/RUNBOOK_audric_sui_parent.md` §1 (parent NFT ID) +
 *  §3 (validated SDK reference shape) + §4 (mainnet smoke test 2026-05-01).
 */

import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { SuinsTransaction, type SuinsClient } from '@mysten/suins';

/**
 * Parent name registered on SuiNS mainnet. Audric's identity namespace anchor.
 *
 * Every leaf created via `buildAddLeafTx` becomes `<label>.audric.sui` and resolves
 * via the standard SuiNS resolver (`suix_resolveNameServiceAddress`).
 */
export const AUDRIC_PARENT_NAME = 'audric.sui';

/**
 * On-chain object ID of the `audric.sui` parent NFT (a `SuinsRegistration`).
 *
 * Owned by the dedicated custody address `0xaca29165188f10136073788f648e1186dd25100100146186ebecedaf94b23d11`
 * (per `RUNBOOK_audric_sui_parent.md` §1). Every leaf mint / revoke MUST be signed
 * by the address that owns this NFT. Mainnet only.
 */
export const AUDRIC_PARENT_NFT_ID =
  '0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198';

export interface BuildAddLeafParams {
  /** Bare label, e.g. `'alice'` — NOT the full `'alice.audric.sui'` path. */
  label: string;
  /** Sui address the leaf will resolve to (typically the user's zkLogin wallet). */
  targetAddress: string;
}

export interface BuildRevokeLeafParams {
  /** Bare label of the leaf to revoke. */
  label: string;
}

export type LabelValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * SuiNS labels accept lowercase ASCII letters, digits, and hyphens. Hyphens cannot
 * lead or trail. The 3–63 char window matches SuiNS protocol rules and the SuiNS
 * dashboard's own `Register` form.
 *
 * The regex permits a single character only when it is alphanumeric (rejected by
 * the length check below for being < 3, but the pattern itself stays internally
 * consistent with DNS conventions).
 *
 * SUINS-LABEL-RULE — paired with `audric/apps/web/lib/identity/validate-label.ts`.
 * The audric host duplicates these rules inline to avoid pulling the full SDK
 * (and its server-side transitive deps) into the client bundle. If SuiNS ever
 * label rules, BOTH this file and the audric copy need updating.
 */
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Validate a leaf label against SuiNS protocol rules. Pure function; no I/O.
 *
 * Pre-call this before `buildAddLeafTx` / `buildRevokeLeafTx` if you want a
 * structured error (the builder functions throw on invalid labels). The audric
 * `/api/identity/check` endpoint uses this to drive the picker's real-time
 * availability indicator.
 *
 * Reserved-name policy (specific Audric handles like `support`, `admin`,
 * `official`) is NOT enforced here — that's a UI / route-level concern owned
 * by the audric host, not a protocol-level rule. See SPEC 10 D3.
 */
export function validateLabel(label: unknown): LabelValidationResult {
  if (typeof label !== 'string') {
    return { valid: false, reason: 'label must be a string' };
  }
  if (label.length < 3) {
    return { valid: false, reason: 'label must be at least 3 characters' };
  }
  if (label.length > 63) {
    return { valid: false, reason: 'label must be at most 63 characters' };
  }
  if (!LABEL_PATTERN.test(label)) {
    return {
      valid: false,
      reason:
        'label may only contain lowercase letters, digits, and hyphens, and may not start or end with a hyphen',
    };
  }
  if (label.includes('--')) {
    return { valid: false, reason: 'label may not contain consecutive hyphens' };
  }
  return { valid: true };
}

/**
 * Build an unsigned PTB that creates a `<label>.audric.sui` leaf subname pointing
 * to `targetAddress`.
 *
 * The returned `Transaction` has neither sender nor gas configured — the caller
 * (audric's `/api/identity/reserve` route) sets the sender to the parent NFT
 * custody address and submits via Enoki sponsorship. See `audric-transaction-flow.mdc`
 * for the sponsored-tx wrapper pattern; note SPEC 10 leaf-mint is a documented
 * CANONICAL-BYPASS of `composeTx` because the signer is the service account, not
 * the user's zkLogin key.
 *
 * Throws synchronously if `label` violates protocol rules or `targetAddress` is
 * not a valid Sui address — fail-closed before bytes are built.
 */
export function buildAddLeafTx(
  suinsClient: SuinsClient,
  { label, targetAddress }: BuildAddLeafParams,
): Transaction {
  const labelCheck = validateLabel(label);
  if (!labelCheck.valid) {
    throw new Error(`buildAddLeafTx: invalid label "${label}" — ${labelCheck.reason}`);
  }
  if (typeof targetAddress !== 'string' || !isValidSuiAddress(normalizeSuiAddress(targetAddress))) {
    throw new Error(`buildAddLeafTx: invalid targetAddress "${targetAddress}"`);
  }

  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  suinsTx.createLeafSubName({
    parentNft: AUDRIC_PARENT_NFT_ID,
    name: `${label}.${AUDRIC_PARENT_NAME}`,
    targetAddress: normalizeSuiAddress(targetAddress),
  });
  return tx;
}

/**
 * Build an unsigned PTB that revokes a `<label>.audric.sui` leaf subname.
 *
 * Used by:
 *   1. The change-username flow (`/api/identity/change`): revoke old leaf inside
 *      the same PTB as the new leaf creation, atomically.
 *   2. The release-username flow (`/api/admin/identity/release`): admin recovery
 *      of squatted / impersonating handles.
 *   3. Account-deletion flow (future): revoke leaf when user deletes their account.
 *
 * The mainnet smoke test (2026-05-01) confirmed revocation gas cost is roughly
 * negative net (storage rebate exceeds computation) — see RUNBOOK §4.
 */
export function buildRevokeLeafTx(
  suinsClient: SuinsClient,
  { label }: BuildRevokeLeafParams,
): Transaction {
  const labelCheck = validateLabel(label);
  if (!labelCheck.valid) {
    throw new Error(`buildRevokeLeafTx: invalid label "${label}" — ${labelCheck.reason}`);
  }

  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  suinsTx.removeLeafSubName({
    parentNft: AUDRIC_PARENT_NFT_ID,
    name: `${label}.${AUDRIC_PARENT_NAME}`,
  });
  return tx;
}

/**
 * Convenience: turn a bare label into the full `<label>.audric.sui` path.
 *
 * **Use this for ON-CHAIN operations** — SuiNS leaf NFT `name` field, the
 * `createLeafSubName` / `removeLeafSubName` move calls, and any RPC call
 * that returns/expects the canonical name string. The `<label>.audric.sui`
 * form is what the SuiNS protocol writes into the NFT `name` field.
 *
 * **Do NOT use this for UI rendering** — that's `displayHandle()`'s job
 * (S.118 reversal of SPEC 10 D10, see audric-build-tracker). Pre-S.118
 * we surfaced the full `.sui` form everywhere; we now use the SuiNS V2
 * `@` form (`alice@audric`) for display because it's shorter, fits the
 * agent harness mono aesthetic, and matches SuiNS's own V2 standard.
 *
 * Both forms resolve to the same address via SuiNS RPC (verified
 * mainnet 2026-05-08 PF1) — `displayHandle()` is purely a render-layer
 * choice, not a backend storage change.
 */
export function fullHandle(label: string): string {
  return `${label}.${AUDRIC_PARENT_NAME}`;
}

/**
 * SuiNS V2 short-form display alias. `displayHandle('alice')` →
 * `'alice@audric'`. Use for chat narration, permission cards, receipts,
 * profile pages, share-to-X copy, OG metadata, and lookup_user output.
 *
 * **Why a separate function from `fullHandle`:**
 *  - `fullHandle('alice')` → `'alice.audric.sui'` is the **on-chain**
 *    NFT name field; SuiNS's `createLeafSubName` writes exactly this
 *    string and `suix_resolveNameServiceAddress` accepts it.
 *  - `displayHandle('alice')` → `'alice@audric'` is the **UI** form
 *    that users see and share. SuiNS RPC also accepts this form
 *    (verified mainnet 2026-05-08 PF1 — both forms return the same
 *    address), so we have one storage form (`<label>.audric.sui`) and
 *    two interchangeable input forms (the user can paste either).
 *
 * Reverses SPEC 10 D10 ("full handle ALWAYS"). See audric-build-tracker
 * S.118 for the rationale; see also `audric/apps/web/lib/identity/`
 * for canonicalization in the input parser (which is a no-op since
 * SuiNS RPC accepts both — kept available for future-proofing).
 */
export function displayHandle(label: string): string {
  // Strip trailing `.sui` from the parent for the display form.
  // Today AUDRIC_PARENT_NAME is `'audric.sui'` → `'audric'`. If the
  // parent ever changes (e.g. `audric.app.sui` becomes the parent),
  // this still produces a sensible display form by removing only the
  // top-level TLD.
  const parentDisplay = AUDRIC_PARENT_NAME.replace(/\.sui$/, '');
  return `${label}@${parentDisplay}`;
}
