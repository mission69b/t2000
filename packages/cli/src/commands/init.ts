// `t2 init` — create a fresh v2 plain Bech32 wallet. No PIN prompt.
// `t2 init --import` — interactive hidden-input prompt for a Bech32 secret.
// `t2 init --import <secret>` — direct CLI flag (scripting; prints
// shell-history warning).
//
// The `--import` primitive is a general "save this Bech32 secret as a v4
// wallet file" — NOT a v3-migration tool. Anyone with a `suiprivkey1...`
// from any source (another v4 machine, Sui CLI export, hardware wallet,
// etc.) can use it. v3 AES files at the default path still throw
// `WALLET_CORRUPT` — they're not silently migrated.
//
// Footer banner: surfaces the default spending limits seeded on init
// (limits ON by default — 2.2). Visible reminder, no prompt friction.

import {
  T2000,
  generateKeypair,
  keypairFromPrivateKey,
  saveKey,
  saveBech32,
  walletExists,
  getAddress,
  setLimits,
  hasLimits,
} from '@t2000/sdk';
import { Command } from 'commander';
import {
  printSuccess,
  printKeyValue,
  printBlank,
  printWarning,
  printLine,
  printJson,
  isJsonMode,
  handleError,
} from '../output.js';
import { askHidden } from '../lib/prompts.js';
import { registerWallet } from '../lib/agent-register.js';

export interface InitOptions {
  key?: string;
  import?: string | boolean;
  // `--no-register` sets this false (default true) — skip on-chain Agent ID.
  register?: boolean;
}

const DEFAULT_API_BASE =
  process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';
// Best-effort register must never hang `init` (offline-tolerant).
const REGISTER_TIMEOUT_MS = 10_000;

// [2.2 — limits ON by default] A fresh wallet ships with conservative,
// USD-denominated caps so an agent can't drain it on day one. The user raises
// them with `t2 limit set` or bypasses per-call with `--force`. Cumulative
// daily is enforced across all writes (send + swap + pay) — see @t2000/sdk/limits.
const DEFAULT_PER_TX_USD = 25;
const DEFAULT_DAILY_USD = 100;

const limitsFooter = (perTx: number, daily: number) =>
  `Spending limits ON: $${perTx}/tx, $${daily}/day (cumulative). Change with \`t2 limit set\`, or override a single call with --force.`;

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Create a new Agent Wallet (no PIN; plain Bech32 key file with 0o600 perms)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option(
      '--import [secret]',
      'Import an existing wallet via Bech32 secret. Omit the value for an interactive hidden-input prompt.',
    )
    .option(
      '--no-register',
      'Skip the best-effort on-chain Agent ID registration (offline/CI).',
    )
    .action(async (opts: InitOptions) => {
      try {
        if (await walletExists(opts.key)) {
          throw new Error(
            `Wallet already exists at ${opts.key ?? '~/.t2000/wallet.key'}. Move or delete it first.`,
          );
        }

        let address: string;
        let imported = false;
        let signingKeypair: { signTransaction(b: Uint8Array): Promise<{ signature: string }> };

        if (opts.import !== undefined) {
          const secret = typeof opts.import === 'string' && opts.import.length > 0
            ? opts.import
            : await askHidden('Paste your suiprivkey1... secret:');

          if (typeof opts.import === 'string' && opts.import.length > 0) {
            printWarning('Private key passed as a CLI flag will be in shell history. Prefer the interactive prompt: `t2 init --import` (no value).');
          }

          const kp = keypairFromPrivateKey(secret);
          await saveBech32(secret, opts.key);
          address = getAddress(kp);
          signingKeypair = kp;
          imported = true;
        } else {
          const keypair = generateKeypair();
          await saveKey(keypair, undefined, opts.key);
          address = getAddress(keypair);
          signingKeypair = keypair;
        }

        // Best-effort on-chain Agent ID — gives the wallet a registry identity
        // from the start. Non-blocking + timeout-bounded so `init` stays
        // offline-tolerant; if it can't reach the sponsor it silently defers
        // (a later `t2 agent register`/`onboard` completes it).
        let registered = false;
        if (opts.register !== false) {
          try {
            await Promise.race([
              registerWallet({ keypair: signingKeypair, address, base: DEFAULT_API_BASE }),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), REGISTER_TIMEOUT_MS),
              ),
            ]);
            registered = true;
          } catch {
            // best-effort — deferred to a later online command
          }
        }

        // Limits ON by default — only seed when the user has none yet (don't
        // clobber a config they configured before creating a wallet).
        if (!hasLimits()) {
          setLimits({ perTxUsd: DEFAULT_PER_TX_USD, dailyUsd: DEFAULT_DAILY_USD });
        }

        if (isJsonMode()) {
          printJson({
            address,
            imported,
            registered,
            configPath: opts.key ?? '~/.t2000/wallet.key',
            limits: { perTxUsd: DEFAULT_PER_TX_USD, dailyUsd: DEFAULT_DAILY_USD },
          });
          return;
        }

        printBlank();
        printSuccess(imported ? 'Wallet imported' : 'Wallet created');
        printKeyValue('Address', address);
        printKeyValue('Path', opts.key ?? '~/.t2000/wallet.key');
        if (opts.register !== false) {
          printKeyValue(
            'Agent ID',
            registered ? 'registered' : 'pending (run: t2 agent register)',
          );
        }
        printBlank();
        printLine(`⚠  ${limitsFooter(DEFAULT_PER_TX_USD, DEFAULT_DAILY_USD)}`);
        printBlank();

        // Eager construct + warm a SuiClient so the next command doesn't pay
        // first-call latency. Non-fatal if it fails (e.g. offline init).
        try {
          await T2000.create({ keyPath: opts.key });
        } catch {
          /* tolerated */
        }
      } catch (error) {
        handleError(error);
      }
    });
}
