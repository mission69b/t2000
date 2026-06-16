// [SPEC_AGENT_PAYMENTS_X402 item 2.12] `t2 fund` — print the wallet address +
// an ASCII QR code so an agent / human can fund it, plus the value-promise.
// Renamed from `t2 receive` (S.463) — the `receive` alias was dropped in S.464
// for a single clean verb (no back-compat shim).

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
