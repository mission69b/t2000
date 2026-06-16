// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// `t2 receive` — print the wallet address + an ASCII QR code so an
// agent / human can fund it. Replaces the old `t2000 wallet fund`
// (which generated a payment link — now superseded by SuiNS handles
// + this minimal flow).
//
// The old `commands/receive.ts` was about invoice generation (S.269
// deprecated the invoice flow); the slug is reused for the right
// abstraction.

import qrcode from 'qrcode';
import pc from 'picocolors';
import { Command } from 'commander';
import { withAgent } from '../lib/with-agent.js';
import {
  printJson,
  isJsonMode,
  handleError,
  printBlank,
  printKeyValue,
  printLine,
} from '../output.js';

export interface ReceiveOptions {
  key?: string;
  qrOnly?: boolean;
}

// [2.12] `t2 fund` is the primary verb (funding is step 1 of onboarding);
// `receive` stays as a hidden back-compat alias so existing scripts/docs keep
// working. The value-promise (what a top-up buys) is folded into the output.
const VALUE_PROMISE = '$5 USDC ≈ ~250 paid API calls (at the $0.02 floor).';

export function registerFund(program: Command) {
  program
    .command('fund')
    .alias('receive')
    .description('Show your wallet address + QR to fund it (USDC / USDsui / SUI on Sui)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--qr-only', 'Print only the QR code (no address text)')
    .action(async (opts: ReceiveOptions) => {
      try {
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();

        if (isJsonMode()) {
          printJson({ address, qrEncodedFor: address, valuePromise: VALUE_PROMISE });
          return;
        }

        printBlank();
        if (!opts.qrOnly) {
          printKeyValue('Address', address);
          printBlank();
          printLine(pc.dim('Accepts USDC, USDsui, or SUI on Sui mainnet.'));
          printLine(pc.dim(VALUE_PROMISE));
          printLine(pc.dim('Scan to send to this wallet:'));
          printBlank();
        }

        const qr = await qrcode.toString(address, {
          type: 'terminal',
          small: true,
          errorCorrectionLevel: 'M',
        });
        process.stdout.write(`${qr}\n`);

        if (!opts.qrOnly) {
          printLine(pc.dim('Or share `' + address + '` directly.'));
          printBlank();
        }
      } catch (error) {
        handleError(error);
      }
    });
}
