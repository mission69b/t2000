import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { x402Client } from '@t2000/x402';
import type { X402Wallet } from '@t2000/x402';
import { resolvePin } from '../prompts.js';
import {
  printSuccess,
  printBlank,
  printJson,
  printInfo,
  isJsonMode,
  handleError,
} from '../output.js';

function createX402Wallet(agent: T2000): X402Wallet {
  return {
    client: agent.suiClient,
    keypair: agent.signer,
    address: () => agent.address(),
    signAndExecute: async (tx) => {
      const result = await agent.suiClient.signAndExecuteTransaction({
        signer: agent.signer,
        transaction: tx as Parameters<typeof agent.suiClient.signAndExecuteTransaction>[0]['transaction'],
      });
      return { digest: result.digest };
    },
  };
}

export function registerPay(program: Command) {
  program
    .command('pay <url>')
    .description('Pay for an x402-protected API resource')
    .option('--key <path>', 'Key file path')
    .option('--method <method>', 'HTTP method (GET, POST, PUT)', 'GET')
    .option('--data <json>', 'Request body for POST/PUT')
    .option('--header <key=value>', 'Additional HTTP header (repeatable)', collectHeaders, {})
    .option('--max-price <amount>', 'Max USDC price to auto-approve', '1.00')
    .option('--timeout <seconds>', 'Request timeout in seconds', '30')
    .option('--dry-run', 'Show what would be paid without paying')
    .action(async (url: string, opts: {
      key?: string;
      method: string;
      data?: string;
      header: Record<string, string>;
      maxPrice: string;
      timeout: string;
      dryRun?: boolean;
    }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        agent.enforcer.check({ operation: 'pay', amount: parseFloat(opts.maxPrice) });

        const wallet = createX402Wallet(agent);
        const client = new x402Client(wallet);

        const startTime = Date.now();

        if (!isJsonMode()) {
          printBlank();
          printInfo(`→ ${opts.method} ${url}`);
        }

        const response = await client.fetch(url, {
          method: opts.method,
          headers: opts.header,
          body: opts.data,
          maxPrice: parseFloat(opts.maxPrice),
          timeout: parseInt(opts.timeout, 10) * 1000,
          dryRun: opts.dryRun,
          onPayment: (details) => {
            if (!isJsonMode()) {
              printInfo(`← 402 Payment Required: $${details.amount} USDC (Sui)`);
              printSuccess(`Paid $${details.amount} USDC (tx: ${details.txHash.slice(0, 10)}...)`);
            }
          },
        });

        const elapsed = Date.now() - startTime;

        if (!isJsonMode()) {
          printInfo(`← ${response.status} ${response.statusText || 'OK'}  ${pc.dim(`[${elapsed}ms]`)}`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        const body = contentType.includes('application/json')
          ? await response.json()
          : await response.text();

        if (isJsonMode()) {
          printJson({
            status: response.status,
            url,
            elapsed,
            body,
          });
        } else {
          printBlank();
          if (typeof body === 'string') {
            console.log(body);
          } else {
            console.log(JSON.stringify(body, null, 2));
          }
          printBlank();
        }
      } catch (error) {
        handleError(error);
      }
    });
}

function collectHeaders(value: string, previous: Record<string, string>): Record<string, string> {
  const [key, ...rest] = value.split('=');
  if (key && rest.length > 0) {
    previous[key.trim()] = rest.join('=').trim();
  }
  return previous;
}
