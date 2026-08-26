import { bcs } from '@mysten/sui/bcs';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { MAINNET_AGENT_ID_PACKAGE_ID } from '@t2000/id';
import { setSponsoredTxGuard } from '@t2000/sdk';
import {
  MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
  MAINNET_A2A_ESCROW_PACKAGE_ID,
} from '@t2000/sdk';

// Never sign bytes you didn't ask for (S.930).
//
// Threat model. The default host is trusted infrastructure; what is NOT
// trusted is anything that can be injected around the process:
//
//   T2000_API_URL=https://evil/v1   → the "server" that builds the tx
//   A2A_ESCROW_PACKAGE_ID=0xevil    → the constants used to check the tx
//   --api https://evil/v1           → same, from the shell
//
// The wallet used to base64-decode whatever prepare returned and sign it. A
// hijacked host could hand back a drain transaction and the CLI would sign it
// without ever looking. Two locks:
//
//   A. A non-default host cannot obtain a signature at all without an
//      explicit opt-in flag.
//   B. Even on the default host, the decoded PTB has to match the verb the
//      user actually typed, checked against MAINNET package literals.
//
// (B) matters because (A) alone still trusts every byte from the real host,
// and (A) matters because (B) can only check what it knows how to parse.

/** The canonical origin. Everything else is "somewhere else". */
export const CANONICAL_API_ORIGIN = 'https://api.t2000.ai';

/** The flag that lets a non-default host obtain a signature. */
export const ALLOW_UNTRUSTED_FLAG = '--allow-untrusted-api';

/** Every verb, mapped to the EXACT target its SDK builder emits.
 *
 *  Transcribed from `packages/sdk/src/wallet/{job,opening}.ts` — not from the
 *  API's action strings, which is how the first cut of this map shipped
 *  `opening::cancel` and `opening::decline`: two functions that do not exist
 *  on mainnet, guarding two happy paths that therefore could not be signed at
 *  all. A fail-closed check is only as good as its ground truth, so the table
 *  below mirrors the builders line for line:
 *
 *    buildDeclineJobTx      → OPENING pkg :: escrow  :: decline   (v3)
 *    buildCancelOpeningTx   → OPENING pkg :: opening :: cancel_open
 *    buildRefundUnclaimedTx → OPENING pkg :: opening :: refund_unclaimed
 *    buildOpenJobTx         → OPENING pkg :: opening :: create_open_v2
 *    buildClaimOpeningTx    → OPENING pkg :: opening :: claim_v2|claim_proven_v2
 *    buildCreateJobTx       → ESCROW  pkg :: escrow  :: create
 *    buildDeliverJobTx      → ESCROW  pkg :: escrow  :: deliver
 *    buildReleaseJobTx      → OPENING pkg :: reputation :: release_v2
 *                           | OPENING pkg :: batch :: batch_release   (S.1202, origin Jobs)
 *
 *  `decline` is the one that looks like a typo and isn't: it lives in the
 *  OPENING package but the `escrow` module, because it shipped in the v3
 *  upgrade. Package ids are the MAINNET literals — deliberately NOT the
 *  env-overridable constants, which would let an attacker supply both the
 *  transaction and the yardstick.
 *
 *  `pkgs` is a FAMILY (S.981): every id is a mainnet publish of OUR package,
 *  and the prepare host's SDK may emit either the original or the latest id
 *  while a release transition is in flight — refusing one of our own ids
 *  would freeze every hire until server and CLI deploys aligned to the
 *  minute. Version safety is the chain's job: after an upgrade + `migrate`,
 *  a call into a stale package id aborts on-chain with EWrongVersion, no
 *  funds moved. The guard's job is package AUTHENTICITY, and both ids are
 *  authentically ours.
 *
 *  A Move upgrade that moves a verb to a new package needs a matching CLI
 *  release. That is the cost of fail-closed, and it is the intended trade.
 */
const ACTION_TARGETS: Record<
  string,
  { pkgs: string[]; module: string; functions: string[] }
> = {
  // Escrow verbs — emitted at the original id (pre-S.981 SDK) or the latest
  // id (S.981+ SDK, the version-gated path).
  create: {
    pkgs: [MAINNET_A2A_ESCROW_PACKAGE_ID, MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'escrow',
    functions: ['create'],
  },
  deliver: {
    pkgs: [MAINNET_A2A_ESCROW_PACKAGE_ID, MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'escrow',
    functions: ['deliver'],
  },
  // S.1192: release settles through `reputation::release_v2` (the active
  // counter rides the money); `create_empty_score` is the allowlisted
  // precursor for a scoreless seller — same hop as reject/refund.
  // S.1202: a batch-origin Job settles through `batch::batch_release`
  // instead (the per-wave hold frees with the money) — same user verb,
  // the prepare host branches on the Job's BatchOriginKey DF, so BOTH
  // targets are authentic shapes of "release".
  release: {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'reputation',
    functions: ['release_v2', 'create_empty_score', 'batch::batch_release'],
  },
  // S.1063: reject/refund settle through the reputation module so protocol
  // outcomes land on scores; `create_empty_score` is the allowlisted
  // PRECURSOR (lazy zero-score create) the same action may prepare first.
  // S.1202: batch-origin variants ride the same verbs (see `release`).
  reject: {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'reputation',
    functions: [
      'reject_v2',
      'reject_v2_agent_buyer',
      'create_empty_score',
      'batch::batch_reject',
      'batch::batch_reject_agent_buyer',
    ],
  },
  refund: {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'reputation',
    functions: ['refund_v2', 'create_empty_score', 'batch::batch_refund'],
  },
  // v3 opening package — note the `escrow` module.
  decline: {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'escrow',
    functions: ['decline'],
  },
  // Open board.
  'open-create': {
    // S.1192: every post rides create_open_v2 (adds the min_seller_level
    // DF write); the v1 door is a dead abort stub.
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'opening',
    functions: ['create_open_v2'],
  },
  'open-claim': {
    // S.1192: every claim carries the claimer's own &mut AgentScore
    // (claim_v2 for Anyone, claim_proven_v2 for Proven 1/2), with
    // `create_empty_score` as the allowlisted precursor when the score
    // doesn't exist yet.
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'opening',
    functions: ['claim_v2', 'claim_proven_v2', 'reputation::create_empty_score'],
  },
  'open-cancel': {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'opening',
    functions: ['cancel_open'],
  },
  'open-refund': {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'opening',
    functions: ['refund_unclaimed'],
  },
  // Batch (wave) openings — S.1193, `a2a_escrow::batch`. One claim per
  // tx (v1 lock); the scoreless-claimer precursor rides cross-module
  // exactly like open-claim's.
  'batch-open-create': {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'batch',
    functions: ['create_batch_open'],
  },
  'batch-open-claim': {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'batch',
    functions: ['batch_claim', 'reputation::create_empty_score'],
  },
  'batch-open-cancel': {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'batch',
    functions: ['cancel_batch_open'],
  },
  'batch-open-refund': {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'batch',
    functions: ['refund_batch_expired'],
  },
  // On-chain review stars (S.1054) — `a2a_escrow::reputation`. Two entries:
  // the seller's first-ever review lazily creates their AgentScore.
  'job-review': {
    pkgs: [MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID],
    module: 'reputation',
    functions: ['submit_review', 'submit_first_review'],
  },
  // Agent ID registry verbs (S.1049) — these used to skip Move-target
  // verification entirely via a HOST_PINNED_ONLY carve-out, which meant
  // `register` signed host-prepared bytes blind. Same rule as escrow now:
  // the allowlist pins the MAINNET literal from @t2000/id — deliberately
  // NOT the env-overridable AGENT_ID_PACKAGE_ID, which an attacker's
  // environment could point at their own package.
  register: {
    pkgs: [MAINNET_AGENT_ID_PACKAGE_ID],
    module: 'registry',
    functions: ['register'],
  },
  update: {
    pkgs: [MAINNET_AGENT_ID_PACKAGE_ID],
    module: 'registry',
    functions: ['update'],
  },
  'set-active': {
    pkgs: [MAINNET_AGENT_ID_PACKAGE_ID],
    module: 'registry',
    functions: ['set_active'],
  },
};

/** The Sui framework package, in the padded form decoded PTBs report. */
const SUI_FRAMEWORK_PACKAGE = normalizeSuiAddress('0x2');

/** Framework calls a funded create may legitimately emit BEFORE/AFTER the
 *  escrow call — the coin-sourcing prelude (S.980).
 *
 *  When a wallet's USDC sits in its address balance (SIP-58 — where gasless
 *  transfers land it), the SDK's `selectAndSplitCoin` funds the PTB through
 *  `coinWithBalance` (`packages/sdk/src/wallet/coinSelection.ts`), whose
 *  build-time resolver emits `0x2` MoveCalls around the escrow call. The
 *  original "every MoveCall === the escrow target" check therefore refused
 *  every real funded `create`/`open-create` for every address-balance wallet.
 *
 *  Transcribed from `@mysten/sui` `transactions/intents/CoinWithBalance.ts` —
 *  the COMPLETE set that resolver can emit, nothing more:
 *
 *    coin::redeem_funds / balance::redeem_funds — withdraw from the SENDER's
 *      own address balance (`withdrawFrom: Sender` by construction)
 *    coin::into_balance — Coin→Balance conversion of a split result
 *    coin::zero / balance::zero — zero-value intents
 *    coin::destroy_zero — burn the zero-value dust coin
 *
 *  `coin::send_funds` (the remainder-return) is deliberately NOT here: it
 *  sends a coin to an arbitrary address, so it is only allowed when its
 *  recipient argument decodes to the transaction sender — see
 *  `isSenderRemainderReturn`. Nothing else from `0x2` (transfer, pay, …)
 *  is allowed: an unexpected module or function still refuses, fail closed.
 */
const FRAMEWORK_PRELUDE: Record<string, ReadonlySet<string>> = {
  coin: new Set(['redeem_funds', 'into_balance', 'zero', 'destroy_zero']),
  balance: new Set(['redeem_funds', 'zero']),
};

export type TxIntent = {
  /** The verb the user typed, as sent to the prepare endpoint. */
  action: string;
  /** For display only. */
  amountUsdc?: number;
  seller?: string;
};

// Process-wide because the flag is a property of the invocation, not of any
// one call site, and threading it through every command would make "forgot to
// pass it" a silent downgrade. Defaults to false — fail closed.
let allowUntrustedApi = false;

/** Set once from the root `--allow-untrusted-api` flag. */
export function setAllowUntrustedApi(value: boolean): void {
  allowUntrustedApi = value;
}

export function isAllowUntrustedApi(): boolean {
  return allowUntrustedApi;
}

export class UntrustedHostError extends Error {}
export class IntentMismatchError extends Error {}

/** Origin of an API base like `https://api.t2000.ai/v1`. */
export function apiOrigin(base: string): string {
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
}

export function isDefaultApiHost(base: string): boolean {
  return apiOrigin(base) === CANONICAL_API_ORIGIN;
}

/**
 * Gate (A). Refuse to go anywhere near a signature when the host that builds
 * the transaction isn't the canonical one and the operator hasn't said so out
 * loud. Called BEFORE the prepare request, so a hijacked host never even sees
 * the wallet address.
 */
export function assertSigningHostAllowed(
  base: string,
  allowUntrusted: boolean,
): void {
  if (isDefaultApiHost(base) || allowUntrusted) {
    return;
  }
  throw new UntrustedHostError(
    `Refusing to sign transactions built by ${apiOrigin(base)}.\n` +
      `  Only ${CANONICAL_API_ORIGIN} is trusted by default. If you really mean to use\n` +
      `  another host (a local or staging API), re-run with ${ALLOW_UNTRUSTED_FLAG}.\n` +
      '  If you did not set T2000_API_URL or --api yourself, treat this as an attack.',
  );
}

/**
 * Gate (B). Decode the prepared bytes and check every Move call against the
 * verb the user asked for.
 *
 * Fails closed everywhere: an unparseable payload, an unknown verb, a call
 * into a package we don't publish, or zero Move calls at all are all refusals.
 * A narrow verified set that grows beats a permissive one that guesses.
 */
export function assertTxMatchesIntent(
  txBytes: string,
  intent: TxIntent,
  opts: { allowUntrusted?: boolean } = {},
): void {
  // On an operator-acknowledged untrusted host the package literals are
  // meaningless (a local chain publishes its own), so the host flag is the
  // only lock left. That is the operator's explicit choice.
  if (opts.allowUntrusted) {
    return;
  }

  const expected = ACTION_TARGETS[intent.action];
  if (!expected) {
    throw new IntentMismatchError(
      `Refusing to sign: "${intent.action}" is not a verb this wallet knows how to verify.`,
    );
  }

  let sender: string | null | undefined;
  let inputs: DecodedInput[];
  let calls: DecodedCall[];
  try {
    const tx = Transaction.from(
      new Uint8Array(Buffer.from(txBytes, 'base64')),
    );
    const data = tx.getData();
    sender = data.sender;
    inputs = data.inputs as DecodedInput[];
    calls = data.commands.flatMap((c) =>
      c.$kind === 'MoveCall' && c.MoveCall
        ? [
            {
              pkg: c.MoveCall.package,
              module: c.MoveCall.module,
              fn: c.MoveCall.function,
              args: (c.MoveCall.arguments ?? []) as DecodedCall['args'],
            },
          ]
        : [],
    );
  } catch (e) {
    throw new IntentMismatchError(
      `Refusing to sign: could not decode the prepared transaction (${
        e instanceof Error ? e.message : 'unreadable'
      }).`,
    );
  }

  if (calls.length === 0) {
    throw new IntentMismatchError(
      'Refusing to sign: the prepared transaction contains no Move calls.',
    );
  }

  // Decoded packages come back zero-padded (`0x000…0002`), the allowlist
  // literals may not be — compare normalized on both sides.
  const expectedPkgs = expected.pkgs.map((p) => normalizeSuiAddress(p));

  let foundIntent = false;
  for (const call of calls) {
    if (expectedPkgs.includes(normalizeSuiAddress(call.pkg))) {
      // S.1192: `functions` entries are bare names in the action's module,
      // or `module::fn`-qualified for cross-module precursors (open-claim's
      // `reputation::create_empty_score` hop rides an `opening` action).
      const matches =
        expected.functions.includes(`${call.module}::${call.fn}`) ||
        (call.module === expected.module && expected.functions.includes(call.fn));
      if (!matches) {
        throw new IntentMismatchError(
          `Refusing to sign: "${intent.action}" should call ${expected.module}::${expected.functions.join('|')}, but the transaction calls ${call.module}::${call.fn}.`,
        );
      }
      foundIntent = true;
      continue;
    }
    if (isAllowedCoinPrelude(call, sender, inputs)) {
      continue;
    }
    throw new IntentMismatchError(
      `Refusing to sign: "${intent.action}" targets package ${expected.pkgs.join(' | ')}, but the transaction calls ${call.pkg}::${call.module}::${call.fn}.`,
    );
  }

  // A PTB made ONLY of allowed prelude calls never touches the escrow — a
  // redeem_funds+send_funds pair with no create is a signature over nothing
  // the user asked for. Refuse it.
  if (!foundIntent) {
    throw new IntentMismatchError(
      `Refusing to sign: "${intent.action}" should call ${expected.module}::${expected.functions.join('|')}, but the transaction never does.`,
    );
  }
}

type DecodedCall = {
  pkg: string;
  module: string;
  fn: string;
  args: { $kind?: string; Input?: number }[];
};

type DecodedInput = { $kind?: string; Pure?: { bytes?: string } };

function isAllowedCoinPrelude(
  call: DecodedCall,
  sender: string | null | undefined,
  inputs: DecodedInput[],
): boolean {
  if (normalizeSuiAddress(call.pkg) !== SUI_FRAMEWORK_PACKAGE) {
    return false;
  }
  if (FRAMEWORK_PRELUDE[call.module]?.has(call.fn)) {
    return true;
  }
  if (call.module === 'coin' && call.fn === 'send_funds') {
    return isSenderRemainderReturn(call, sender, inputs);
  }
  return false;
}

/** `coin::send_funds(coin, recipient)` is allowed ONLY as the remainder
 *  return the `coinWithBalance` resolver appends — recipient must be a Pure
 *  address input that decodes to the transaction sender. Any other shape
 *  (a different address, a non-Pure argument, no sender on the tx) refuses:
 *  send_funds to anyone else is a drain, not a prelude. */
function isSenderRemainderReturn(
  call: DecodedCall,
  sender: string | null | undefined,
  inputs: DecodedInput[],
): boolean {
  if (!sender) {
    return false;
  }
  const recipientArg = call.args[1];
  if (
    !recipientArg ||
    recipientArg.$kind !== 'Input' ||
    typeof recipientArg.Input !== 'number'
  ) {
    return false;
  }
  const input = inputs[recipientArg.Input];
  if (!input || input.$kind !== 'Pure' || !input.Pure?.bytes) {
    return false;
  }
  try {
    const recipient = bcs.Address.fromBase64(input.Pure.bytes);
    return normalizeSuiAddress(recipient) === normalizeSuiAddress(sender);
  } catch {
    return false;
  }
}

/** One line so a person can see what they're about to authorize. */
export function describeIntent(intent: TxIntent, base: string): string {
  const bits = [intent.action];
  if (intent.amountUsdc !== undefined) {
    bits.push(`$${intent.amountUsdc}`);
  }
  if (intent.seller) {
    bits.push(`→ ${intent.seller.slice(0, 6)}…${intent.seller.slice(-4)}`);
  }
  return `About to sign: ${bits.join(' ')} (${apiOrigin(base).replace('https://', '')})`;
}

/**
 * Teach the SDK's open-board path the same two locks.
 *
 * `postOpenJob` / `claimOpenJob` / `cancelOpenJob` / `refundOpenJob` sign
 * inside `@t2000/sdk`, not through `runSponsoredTx` — posting an opening
 * moves the buyer's USDC, so leaving that path blind would have left the
 * loudest hole exactly where the money is.
 */
export function installSponsoredTxGuard(): void {
  setSponsoredTxGuard(({ base, action, txBytes }) => {
    const allowUntrusted = isAllowUntrustedApi();
    if (txBytes === undefined) {
      assertSigningHostAllowed(base, allowUntrusted);
      return;
    }
    assertTxMatchesIntent(txBytes, { action }, { allowUntrusted });
  });
}
