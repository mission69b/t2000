import type { Command } from 'commander';
import pc from 'picocolors';
import { T2000 } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import {
  printSuccess,
  printBlank,
  printJson,
  printInfo,
  isJsonMode,
  handleError,
} from '../output.js';

export function registerPay(program: Command) {
  program
    .command('pay <url>')
    .description('Pay for an MPP-protected API resource')
    .option('--key <path>', 'Key file path')
    .option('--method <method>', 'HTTP method (GET, POST, PUT)', 'GET')
    .option('--data <json>', 'Request body for POST/PUT')
    .option('--header <key=value>', 'Additional HTTP header (repeatable)', collectHeaders, {})
    .option('--max-price <amount>', 'Max USDC price to auto-approve', '1.00')
    .action(async (url: string, opts: {
      key?: string;
      method: string;
      data?: string;
      header: Record<string, string>;
      maxPrice: string;
    }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const startTime = Date.now();

        if (!isJsonMode()) {
          printBlank();
          printInfo(`→ ${opts.method} ${url}`);
        }

        const maxPrice = parseFloat(opts.maxPrice);
        if (isNaN(maxPrice) || maxPrice <= 0) {
          throw new Error(`Invalid --max-price: "${opts.maxPrice}". Must be a positive number.`);
        }

        const result = await agent.pay({
          url,
          method: opts.method,
          headers: opts.header,
          body: opts.data,
          maxPrice,
        });

        const elapsed = Date.now() - startTime;

        if (!isJsonMode()) {
          if (result.paid && result.receipt) {
            printSuccess(`Paid via MPP (tx: ${result.receipt.reference.slice(0, 10)}...)`);
          }
          printInfo(`← ${result.status} OK  ${pc.dim(`[${elapsed}ms]`)}`);
        }

        if (isJsonMode()) {
          printJson({
            status: result.status,
            url,
            elapsed,
            paid: result.paid,
            cost: result.cost,
            receipt: result.receipt,
            body: result.body,
          });
        } else {
          printBlank();
          if (typeof result.body === 'string') {
            console.log(result.body);
          } else {
            console.log(JSON.stringify(result.body, null, 2));
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
