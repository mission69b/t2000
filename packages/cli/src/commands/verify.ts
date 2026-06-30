import type { Command } from 'commander';
import pc from 'picocolors';
import { type VerifyCheck, verifyReceipt } from '@t2000/sdk';
import {
  handleError,
  isJsonMode,
  printBlank,
  printJson,
  printLine,
} from '../output.js';

// `t2 verify <receipt-id>` — check, don't trust, a confidential response
// (SPEC_CONFIDENTIAL_API v3.0, Phase D). The Sui-anchor check reads the
// on-chain ReceiptAnchored event straight from a fullnode (fully trustless);
// the upstream check reads the attestation evidence in the signed receipt.
// Fails closed (exit 1) on any forgery/mismatch.

function mark(check: VerifyCheck): string {
  if (check.status === 'pass') {
    return pc.green('✓');
  }
  if (check.status === 'fail') {
    return pc.red('✗');
  }
  return pc.dim('•');
}

function trustTag(check: VerifyCheck): string {
  if (check.trust === 'trustless') {
    return pc.green(' (trustless)');
  }
  if (check.trust === 'roadmap') {
    return pc.dim(' (roadmap)');
  }
  return pc.dim(' (in signed receipt)');
}

export function registerVerify(program: Command): void {
  program
    .command('verify')
    .argument('<receipt-id>', 'A confidential receipt id (rcpt-…)')
    .description(
      'Verify a confidential response by receipt id — checks the signed receipt + its trustless on-chain Sui anchor. Fails closed on any mismatch.',
    )
    .option('--api <url>', 'API base URL (default https://api.t2000.ai/v1)')
    .option('--model <id>', 'Confidential model for the attested key (default phala/glm-5.2)')
    .option('--quick', 'Skip the local DCAP quote verification (the slower, network-bound check)')
    .option('--testnet', 'Read the anchor from Sui testnet (default mainnet)')
    .action(
      async (
        receiptId: string,
        opts: { api?: string; model?: string; quick?: boolean; testnet?: boolean },
      ) => {
      try {
        const result = await verifyReceipt(receiptId, {
          apiBase: opts.api,
          model: opts.model,
          skipQuote: opts.quick,
          network: opts.testnet ? 'testnet' : 'mainnet',
        });

        if (isJsonMode()) {
          printJson(result);
          if (!result.verified) {
            process.exitCode = 1;
          }
          return;
        }

        printBlank();
        printLine(pc.bold(`Verifying ${receiptId}`));
        printBlank();
        for (const check of result.checks) {
          printLine(`  ${mark(check)} ${pc.bold(check.name)}${trustTag(check)}`);
          printLine(`      ${pc.dim(check.detail)}`);
          // Under the upstream check, surface the typed TCB claims + the
          // attested-session id (resolve at /v1/aci/sessions/{id}).
          if (check.name === 'Confidential upstream' && result.upstream) {
            for (const c of result.upstream.claims ?? []) {
              const src = c.source ? pc.dim(` (${c.source})`) : '';
              printLine(`        ${pc.dim('·')} ${c.name}: ${c.status}${src}`);
            }
            if (result.upstream.sessionId) {
              printLine(pc.dim(`        session: ${result.upstream.sessionId}`));
            }
          }
        }
        printBlank();
        if (result.anchor) {
          printLine(pc.dim(`  anchor: ${result.anchor.explorer}`));
        }
        if (result.verified) {
          printLine(
            pc.green(
              '  RESULT: ✓ verified — genuine TDX quote + TEE-signed receipt + Sui anchor, all checked client-side.',
            ),
          );
        } else {
          printLine(pc.red('  RESULT: ✗ NOT verified — see the failed check above.'));
          process.exitCode = 1;
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
      },
    );
}
