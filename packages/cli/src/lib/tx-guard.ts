import { Transaction } from '@mysten/sui/transactions';
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
 *    buildOpenJobTx         → OPENING pkg :: opening :: create_open
 *    buildClaimOpeningTx    → OPENING pkg :: opening :: claim
 *    buildCreateJobTx       → ESCROW  pkg :: escrow  :: create
 *    buildDeliverJobTx      → ESCROW  pkg :: escrow  :: deliver
 *    jobCall                → ESCROW  pkg :: escrow  :: release|refund|reject
 *
 *  `decline` is the one that looks like a typo and isn't: it lives in the
 *  OPENING package but the `escrow` module, because it shipped in the v3
 *  upgrade. Package ids are the MAINNET literals — deliberately NOT the
 *  env-overridable constants, which would let an attacker supply both the
 *  transaction and the yardstick.
 *
 *  A Move upgrade that moves a verb to a new package needs a matching CLI
 *  release. That is the cost of fail-closed, and it is the intended trade.
 */
const ACTION_TARGETS: Record<
  string,
  { pkg: string; module: string; functions: string[] }
> = {
  // v1 escrow package.
  create: {
    pkg: MAINNET_A2A_ESCROW_PACKAGE_ID,
    module: 'escrow',
    functions: ['create'],
  },
  deliver: {
    pkg: MAINNET_A2A_ESCROW_PACKAGE_ID,
    module: 'escrow',
    functions: ['deliver'],
  },
  release: {
    pkg: MAINNET_A2A_ESCROW_PACKAGE_ID,
    module: 'escrow',
    functions: ['release'],
  },
  reject: {
    pkg: MAINNET_A2A_ESCROW_PACKAGE_ID,
    module: 'escrow',
    functions: ['reject'],
  },
  refund: {
    pkg: MAINNET_A2A_ESCROW_PACKAGE_ID,
    module: 'escrow',
    functions: ['refund'],
  },
  // v3 opening package — note the `escrow` module.
  decline: {
    pkg: MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
    module: 'escrow',
    functions: ['decline'],
  },
  // Open board.
  'open-create': {
    pkg: MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
    module: 'opening',
    functions: ['create_open'],
  },
  'open-claim': {
    pkg: MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
    module: 'opening',
    functions: ['claim'],
  },
  'open-cancel': {
    pkg: MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
    module: 'opening',
    functions: ['cancel_open'],
  },
  'open-refund': {
    pkg: MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
    module: 'opening',
    functions: ['refund_unclaimed'],
  },
};

/** Verbs that are NOT marketplace escrow calls and are verified by host pin
 *  alone — the registry package is not in the escrow allowlist, and its args
 *  aren't extractable here. Narrow and named rather than a silent fallthrough. */
const HOST_PINNED_ONLY = new Set(['register', 'link', 'confirm']);

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
  if (HOST_PINNED_ONLY.has(intent.action)) {
    return;
  }

  const expected = ACTION_TARGETS[intent.action];
  if (!expected) {
    throw new IntentMismatchError(
      `Refusing to sign: "${intent.action}" is not a verb this wallet knows how to verify.`,
    );
  }

  let calls: { pkg: string; module: string; fn: string }[];
  try {
    const tx = Transaction.from(
      new Uint8Array(Buffer.from(txBytes, 'base64')),
    );
    calls = tx
      .getData()
      .commands.flatMap((c) =>
        c.$kind === 'MoveCall' && c.MoveCall
          ? [
              {
                pkg: c.MoveCall.package,
                module: c.MoveCall.module,
                fn: c.MoveCall.function,
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

  for (const call of calls) {
    if (call.pkg !== expected.pkg) {
      throw new IntentMismatchError(
        `Refusing to sign: "${intent.action}" targets package ${expected.pkg}, but the transaction calls ${call.pkg}.`,
      );
    }
    if (call.module !== expected.module) {
      throw new IntentMismatchError(
        `Refusing to sign: "${intent.action}" should call ${expected.module}, but the transaction calls ${call.module}.`,
      );
    }
    if (!expected.functions.includes(call.fn)) {
      throw new IntentMismatchError(
        `Refusing to sign: "${intent.action}" should call ${expected.module}::${expected.functions.join('|')}, but the transaction calls ${call.module}::${call.fn}.`,
      );
    }
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
