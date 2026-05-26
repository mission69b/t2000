// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// `t2 pay <url> [options]` — v4 Agent Wallet surface.
//
// Contract changes vs. the pre-pivot legacy command:
//   - PIN flow removed. Uses `withAgent` from `lib/with-agent.ts`,
//     which also runs the legacy v3.x wallet pre-flight banner.
//   - Adds `--estimate` flag: issues the request WITHOUT a payment
//     header, parses the 402 challenge via `mppx.Challenge.fromResponse`,
//     prints `realm` + `intent` + `amount` + `currency` + `recipient`,
//     and exits 0 without paying. SPEC verification gate
//     ("t2 pay <url> --estimate" → prints price + service info, returns
//     exit 0 without executing).
//   - Surfaces the SDK's gasless badge (`gasCostSui === 0`) — when an
//     MPP payment hits the Sui gasless stablecoin allowlist, the
//     receipt renders `gasless ⚡` instead of a SUI cost.
//
// `--data` + `--method` + `--header` + `--max-price` semantics
// preserved from the legacy command.

import type { Command } from 'commander';
import pc from 'picocolors';
import {
  printSuccess,
  printBlank,
  printJson,
  printInfo,
  printKeyValue,
  isJsonMode,
  handleError,
} from '../output.js';
import { withAgent } from '../lib/with-agent.js';
import { assertWithinLimits } from './limit/enforce.js';

interface PayOptions {
  key?: string;
  method: string;
  data?: string;
  header: Record<string, string>;
  maxPrice: string;
  estimate?: boolean;
  force?: boolean;
}

export function registerPay(program: Command) {
  program
    .command('pay <url>')
    .description('Pay an MPP / x402 service (USDC on Sui)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--method <method>', 'HTTP method (GET, POST, PUT)', 'GET')
    .option('--data <json>', 'Request body for POST/PUT (auto-promotes --method to POST)')
    .option('--header <key=value>', 'Additional HTTP header (repeatable)', collectHeaders, {})
    .option('--max-price <amount>', 'Max USDC price to auto-approve', '1.00')
    .option(
      '--estimate',
      'Preview the price + service info (no signing, no payment). Exits 0 if the service responds with a 402 challenge.',
    )
    .option('--force', 'Override opt-in spending limits (see `t2 limit`)')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 pay https://api.example.com/data
                                       Pay for a GET endpoint
  $ t2 pay https://api.example.com/run --data '{"prompt":"hi"}'
                                       POST with JSON body (auto-promotes --method)
  $ t2 pay https://api.example.com/data --estimate
                                       Show price + service info without paying
  $ t2 pay https://api.example.com/data --max-price 0.50
                                       Cap auto-approve at $0.50
`,
    )
    .action(async (url: string, opts: PayOptions) => {
      try {
        if (opts.estimate) {
          await runEstimate(url, opts);
          return;
        }

        const maxPrice = parseFloat(opts.maxPrice);
        if (Number.isNaN(maxPrice) || maxPrice <= 0) {
          throw new Error(`Invalid --max-price: "${opts.maxPrice}". Must be a positive number.`);
        }

        await assertWithinLimits({ operation: 'pay', amountUsd: maxPrice, force: opts.force });

        const agent = await withAgent({ keyPath: opts.key });

        const startTime = Date.now();
        const method = opts.data && opts.method === 'GET' ? 'POST' : opts.method;

        if (!isJsonMode()) {
          printBlank();
          printInfo(`→ ${method} ${url}`);
        }

        const result = await agent.pay({
          url,
          method,
          headers: opts.header,
          body: opts.data,
          maxPrice,
        });

        const elapsed = Date.now() - startTime;

        if (isJsonMode()) {
          printJson({
            status: result.status,
            url,
            elapsed,
            paid: result.paid,
            cost: result.cost,
            gasCostSui: result.gasCostSui,
            gasless: result.gasCostSui === 0,
            receipt: result.receipt,
            body: result.body,
          });
          return;
        }

        if (result.paid && result.receipt) {
          const gasNote =
            typeof result.gasCostSui === 'number'
              ? result.gasCostSui === 0
                ? pc.green(' · gasless ⚡')
                : pc.dim(` · gas: ${result.gasCostSui.toFixed(6)} SUI`)
              : '';
          printSuccess(`Paid via MPP (tx: ${result.receipt.reference.slice(0, 10)}…)${gasNote}`);
        }
        printInfo(`← ${result.status} OK  ${pc.dim(`[${elapsed}ms]`)}`);

        printBlank();
        if (typeof result.body === 'string') {
          console.log(result.body);
        } else {
          console.log(JSON.stringify(result.body, null, 2));
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}

/**
 * `--estimate` path. Issues the request with no Payment header, expects
 * a 402, parses the WWW-Authenticate challenge, prints the relevant
 * fields. Exits 0 on success — this is a discovery / pricing flow, not
 * an error path.
 */
async function runEstimate(url: string, opts: PayOptions): Promise<void> {
  const method = opts.data && opts.method === 'GET' ? 'POST' : opts.method;
  const canHaveBody = method !== 'GET' && method !== 'HEAD';

  if (!isJsonMode()) {
    printBlank();
    printInfo(`→ ${method} ${url}  ${pc.dim('(estimate — no payment)')}`);
  }

  const response = await fetch(url, {
    method,
    headers: opts.header,
    body: canHaveBody ? opts.data : undefined,
  });

  if (response.status !== 402) {
    // The endpoint is either open (no payment needed) or returned a
    // non-MPP error. Either way, surface the status + body so the user
    // can act on it.
    const body = await response.text().catch(() => '');
    if (isJsonMode()) {
      printJson({
        url,
        method,
        status: response.status,
        estimate: null,
        note:
          response.status >= 200 && response.status < 300
            ? 'Endpoint responded without a 402 challenge — no payment required.'
            : `Endpoint responded with ${response.status} (not a 402 payment challenge).`,
        body,
      });
      return;
    }
    if (response.status >= 200 && response.status < 300) {
      printSuccess(`No payment required (status ${response.status}).`);
    } else {
      printInfo(`Status ${response.status} — not a 402 payment challenge.`);
    }
    if (body) {
      printBlank();
      console.log(body);
      printBlank();
    }
    return;
  }

  // Parse the 402 challenge via mppx. Dynamic import keeps the
  // top-level pay.ts file lightweight in non-pay invocations.
  const { Challenge } = await import('mppx');
  let challenge: ReturnType<typeof Challenge.fromResponse>;
  try {
    challenge = Challenge.fromResponse(response);
  } catch (err) {
    throw new Error(
      `Service returned 402 but the WWW-Authenticate challenge could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const request = challenge.request as {
    amount?: string;
    currency?: string;
    recipient?: string;
  };
  const amountRaw = request.amount;
  const currency = request.currency ?? 'unknown';
  const recipient = request.recipient ?? 'unknown';

  // Convert USDC raw units (6-decimal) to a USD display value when the
  // currency type ends in `::usdc::USDC` — best-effort, falls back to
  // raw if anything looks unfamiliar.
  const looksLikeUsdc = /::usdc::USDC/i.test(currency);
  const display =
    amountRaw && looksLikeUsdc
      ? `$${(Number(amountRaw) / 1_000_000).toFixed(4)} USDC`
      : amountRaw ?? 'unknown';

  if (isJsonMode()) {
    printJson({
      url,
      method,
      status: 402,
      estimate: {
        realm: challenge.realm,
        method: challenge.method,
        intent: challenge.intent,
        description: challenge.description,
        expires: challenge.expires,
        amount: amountRaw,
        amountDisplay: display,
        currency,
        recipient,
      },
    });
    return;
  }

  printBlank();
  printSuccess(`Service requires payment (402 challenge parsed)`);
  printKeyValue('Realm', challenge.realm);
  printKeyValue('Method', `${challenge.method} / ${challenge.intent}`);
  printKeyValue('Price', pc.green(display));
  if (challenge.description) {
    printKeyValue('Description', challenge.description);
  }
  if (challenge.expires) {
    printKeyValue('Expires', challenge.expires);
  }
  printKeyValue('Recipient', recipient);
  printBlank();
  printInfo(`Run without --estimate to pay and execute.`);
  printBlank();
}

export function collectHeaders(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const [key, ...rest] = value.split('=');
  if (key && rest.length > 0) {
    previous[key.trim()] = rest.join('=').trim();
  }
  return previous;
}
