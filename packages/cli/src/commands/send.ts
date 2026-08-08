// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// `t2 send <amount> <asset> <recipient>` — v4 Agent Wallet surface.
//
// Contract:
//   - `<asset>` is REQUIRED. There is no USDC default. A bare
//     `t2 send 5 alice.sui` exits 1 with a clear error.
//   - [S.957 — 2026-08-08] Asset is ANY held coin type — a registry
//     symbol (USDC, MANIFEST, …) or a full `0x…::module::TYPE`.
//     Unresolvable symbols still exit 1. USDC + USDsui are gasless;
//     everything else (SUI included) needs SUI for gas.
//   - USDC + USDsui transfers go through the SDK's gasless
//     `0x2::balance::send_funds` path. When the SDK reports
//     `gasCost === 0`, the receipt renders a `gasless ⚡` badge so the
//     operator sees the protocol-level zero-gas semantic actually
//     kicked in.
//   - PIN flow removed. Uses `withAgent` from `lib/with-agent.ts`.
//
// SuiNS resolution is delegated to the SDK's `T2000.resolveRecipient` —
// 0x addresses, `.sui` names (including subnames like `alice.audric.sui`)
// AND Passport handles (`alice@audric` → `alice.audric.sui`, P3.1/S.912)
// resolve without CLI-side handling. Other `@namespace` forms stay invalid.

import type { Command } from 'commander';
import pc from 'picocolors';
import { truncateAddress, formatUsd, classifySendAsset } from '@t2000/sdk';
import {
  printSuccess,
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  explorerUrl,
} from '../output.js';
import { withAgent } from '../lib/with-agent.js';

const ASSET_HINT =
  'a registry symbol (USDC, USDsui, SUI, MANIFEST, …) or a full coin type (0x…::module::TYPE)';

/**
 * Pure parser for the `t2 send` positional args.
 *
 * Accepted shapes (all asset-required):
 *   - `t2 send 5 USDC 0x…`
 *   - `t2 send 10 MANIFEST 0x…`                    ← S.957: any held token
 *   - `t2 send 10 0xc466…::manifest::MANIFEST 0x…` ← full coin type
 *   - `t2 send 5 USDC alice.sui`
 *   - `t2 send 5 USDC to 0x…`  ← legacy "to" filler word still tolerated
 *
 * Rejected:
 *   - `t2 send 5 0x…`               → asset required
 *   - `t2 send 5`                   → usage error
 *   - `t2 send 5 FOOBAR 0x…`        → unresolvable asset
 *
 * [S.957] Validation delegates to the SDK's `classifySendAsset` — the same
 * resolvability rule the write path enforces (single source of truth). The
 * returned `asset` keeps the canonical symbol for the big three (so display
 * stays `USDsui`, not `usdsui`) and passes anything else through verbatim
 * for the SDK to resolve again.
 */
export function parseSendArgs(args: string[]): {
  amount: number;
  asset: string;
  recipient: string;
} {
  const filtered = args.filter((a) => a.toLowerCase() !== 'to');

  if (filtered.length < 2) {
    throw new Error(
      `Usage: t2 send <amount> <asset> <recipient>\n  asset is ${ASSET_HINT}\n  recipient can be a 0x address or SuiNS name (alice.sui, alice.audric.sui)`,
    );
  }

  if (filtered.length === 2) {
    // `t2 send 5 alice.sui` — asset omitted. Error rather than
    // silently defaulting to USDC.
    throw new Error(
      `Missing required <asset> argument. Use ${ASSET_HINT}. Example: t2 send ${filtered[0]} USDC ${filtered[1]}`,
    );
  }

  const amount = parseFloat(filtered[0]);
  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error(`Amount must be a positive number (got "${filtered[0]}").`);
  }

  const candidate = filtered[1];
  const cls = classifySendAsset(candidate);
  if (!cls) {
    throw new Error(
      `Unknown asset "${candidate}". Use ${ASSET_HINT}. Check your holdings with \`t2 balance\`.`,
    );
  }

  const recipient = filtered[2];
  if (!recipient) {
    throw new Error(`Missing recipient. Usage: t2 send <amount> <asset> <recipient>.`);
  }

  // Canonical symbol for the well-known three (display consistency); a full
  // coin type or alt symbol passes through as typed — the SDK re-resolves.
  const asset =
    cls.kind === 'gasless-stable' || cls.kind === 'sui' ? cls.symbol : candidate;
  return { amount, asset, recipient };
}

export function registerSend(program: Command) {
  program
    .command('send')
    .argument('<amount>', 'Amount of <asset> to send (denominated in asset units, NOT USD)')
    .argument(
      '[args...]',
      'Asset (registry symbol like USDC / MANIFEST, or a full 0x…::module::TYPE coin type), optional "to" keyword, and recipient (0x address or SuiNS name like alice.sui)',
    )
    .description(
      'Send any held token. USDC + USDsui are gasless; everything else needs SUI for gas.',
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--force', 'Override spending limits for this call (see `t2 limit`)')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 send 5 USDC 0xabc…              Send 5 USDC (gasless) to a hex address
  $ t2 send 5 USDsui alice.sui         Send 5 USDsui (gasless) to a SuiNS name
  $ t2 send 0.1 SUI alice.audric.sui   Send 0.1 SUI (gas required) to a SuiNS subname
  $ t2 send 10 MANIFEST 0xabc…         Send any held token (gas required)
  $ t2 send 10 0xc466…::manifest::MANIFEST 0xabc…   Full coin type works too
`,
    )
    .action(async (amount: string, args: string[], opts: { key?: string; force?: boolean }) => {
      try {
        const { amount: parsedAmount, asset, recipient } = parseSendArgs([amount, ...args]);

        const agent = await withAgent({ keyPath: opts.key });

        // The spending-limit gate now lives in the SDK write path (one gate
        // for CLI + MCP + programmatic). Pass `--force` through; the SDK
        // throws LimitExceededError, which handleError() renders.
        const result = await agent.send({
          to: recipient,
          amount: parsedAmount,
          // [S.957] Any resolvable asset string — the SDK re-resolves via
          // `classifySendAsset` (same rule the parser used).
          asset,
          force: opts.force,
        });

        if (isJsonMode()) {
          printJson({
            ...result,
            asset,
            gasless: result.gasCost === 0,
          });
          return;
        }

        const displayTo = result.suinsName
          ? `${result.suinsName} ${pc.dim(`(${truncateAddress(result.to)})`)}`
          : truncateAddress(result.to);

        // Stables render as USD (1:1); SUI keeps its 4dp habit; any other
        // token renders plain `<amount> <asset>` — never an invented $.
        const amountDisplay =
          asset === 'USDC' || asset === 'USDsui'
            ? `${formatUsd(result.amount)} ${asset}`
            : asset === 'SUI'
              ? `${result.amount.toFixed(4)} SUI`
              : `${result.amount} ${asset}`;

        printBlank();
        printSuccess(`Sent ${amountDisplay} → ${displayTo}`);
        if (result.gasCost === 0) {
          // Protocol-level gasless via `0x2::balance::send_funds`.
          printKeyValue('Gas', pc.green('gasless ⚡'));
        } else {
          printKeyValue('Gas', `${result.gasCost.toFixed(6)} ${result.gasCostUnit}`);
        }
        printKeyValue('Tx', explorerUrl(result.tx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
