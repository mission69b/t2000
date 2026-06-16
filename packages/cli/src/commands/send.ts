// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// `t2 send <amount> <asset> <recipient>` — v4 Agent Wallet surface.
//
// Contract changes vs. the pre-pivot legacy command:
//   - `<asset>` is REQUIRED. There is no USDC default. A bare
//     `t2 send 5 alice.sui` exits 1 with a clear error.
//   - Asset is constrained to USDC / USDsui / SUI (matches SDK
//     `OPERATION_ASSETS.send` after Day 2). Any other token gets a
//     `unsupported asset` error pointing at `t2 swap` as the path to
//     get into USDC / USDsui / SUI first.
//   - USDC + USDsui transfers go through the SDK's gasless
//     `0x2::balance::send_funds` path (Day 2 rewrite). When the SDK
//     reports `gasCost === 0`, the receipt renders a `gasless ⚡`
//     badge so the operator sees the protocol-level zero-gas semantic
//     actually kicked in.
//   - PIN flow removed. Uses `withAgent` from `lib/with-agent.ts`.
//
// SuiNS + @audric handle resolution is delegated to the SDK's
// `T2000.resolveRecipient` — both `alice.sui` and `mission69b@audric`
// resolve transparently without CLI-side handling.

import type { Command } from 'commander';
import pc from 'picocolors';
import { truncateAddress, formatUsd, type SupportedAsset } from '@t2000/sdk';
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

const ACCEPTED_ASSETS = ['USDC', 'USDsui', 'SUI'] as const;
type AcceptedAsset = (typeof ACCEPTED_ASSETS)[number];

const ACCEPTED_ASSETS_LIST = ACCEPTED_ASSETS.join(', ');

/**
 * Pure parser for the v4 `t2 send` positional args.
 *
 * Accepted shapes (all asset-required):
 *   - `t2 send 5 USDC 0x…`
 *   - `t2 send 5 USDC alice.sui`
 *   - `t2 send 5 USDC mission69b@audric`
 *   - `t2 send 5 USDC to 0x…`  ← legacy "to" filler word still tolerated
 *
 * Rejected:
 *   - `t2 send 5 0x…`            → asset required
 *   - `t2 send 5`                → usage error
 *   - `t2 send 5 USDY 0x…`       → unsupported asset
 */
export function parseSendArgs(args: string[]): {
  amount: number;
  asset: AcceptedAsset;
  recipient: string;
} {
  const filtered = args.filter((a) => a.toLowerCase() !== 'to');

  if (filtered.length < 2) {
    throw new Error(
      `Usage: t2 send <amount> <asset> <recipient>\n  asset must be one of: ${ACCEPTED_ASSETS_LIST}\n  recipient can be a 0x address, SuiNS name (alice.sui), or @audric handle`,
    );
  }

  if (filtered.length === 2) {
    // `t2 send 5 alice.sui` — asset omitted. Error rather than
    // silently defaulting to USDC.
    throw new Error(
      `Missing required <asset> argument. Use one of: ${ACCEPTED_ASSETS_LIST}. Example: t2 send ${filtered[0]} USDC ${filtered[1]}`,
    );
  }

  const amount = parseFloat(filtered[0]);
  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error(`Amount must be a positive number (got "${filtered[0]}").`);
  }

  const candidate = filtered[1];
  const normalized = normalizeAssetSymbol(candidate);
  if (!normalized) {
    throw new Error(
      `Unsupported asset "${candidate}". Use one of: ${ACCEPTED_ASSETS_LIST}. Swap to USDC or USDsui first with \`t2 swap\`, or send SUI.`,
    );
  }

  const recipient = filtered[2];
  if (!recipient) {
    throw new Error(`Missing recipient. Usage: t2 send <amount> <asset> <recipient>.`);
  }

  return { amount, asset: normalized, recipient };
}

/**
 * Case-insensitive normalisation. `usdc` / `USDC` / `usdsui` /
 * `USDSUI` / `USDsui` / `sui` / `SUI` all map. Anything else returns
 * `undefined`.
 */
function normalizeAssetSymbol(input: string): AcceptedAsset | undefined {
  const lower = input.toLowerCase();
  if (lower === 'usdc') return 'USDC';
  if (lower === 'usdsui') return 'USDsui';
  if (lower === 'sui') return 'SUI';
  return undefined;
}

export function registerSend(program: Command) {
  program
    .command('send')
    .argument('<amount>', 'Amount of <asset> to send (denominated in asset units, NOT USD)')
    .argument(
      '[args...]',
      'Asset (USDC | USDsui | SUI), optional "to" keyword, and recipient (0x address, SuiNS name like alice.sui, or @audric handle)',
    )
    .description('Send USDC, USDsui, or SUI. USDC + USDsui are gasless (no SUI required).')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--force', 'Override spending limits for this call (see `t2 limit`)')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 send 5 USDC 0xabc…              Send 5 USDC (gasless) to a hex address
  $ t2 send 5 USDsui alice.sui         Send 5 USDsui (gasless) to a SuiNS name
  $ t2 send 0.1 SUI mission69b@audric  Send 0.1 SUI (gas required) to an @audric handle
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
          // The CLI parser already narrowed asset to USDC / USDsui / SUI;
          // the SDK accepts `SupportedAsset` and re-validates via
          // `assertAllowedAsset('send', …)` at runtime.
          asset: asset as SupportedAsset,
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

        const amountDisplay = asset === 'SUI'
          ? `${result.amount.toFixed(4)} SUI`
          : `${formatUsd(result.amount)} ${asset}`;

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
