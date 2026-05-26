// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 services inspect <url>` — look up a single service or endpoint
// in the MPP gateway catalog. Prints pricing + description; pairs with
// `t2 pay --estimate` (which goes one layer deeper and parses the
// live 402 challenge).

import type { Command } from 'commander';
import pc from 'picocolors';
import { fetchCatalog, findByUrl, type CatalogEndpoint } from './catalog.js';
import {
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printSeparator,
  printError,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface ServicesInspectOptions {
  gateway?: string;
}

export function registerServicesInspect(parent: Command) {
  parent
    .command('inspect')
    .description('Show pricing + endpoints for an MPP service or endpoint URL')
    .argument('<url>', 'Service base URL or endpoint URL')
    .option('--gateway <url>', 'Override gateway base URL (default: https://mpp.t2000.ai)')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 services inspect https://mpp.t2000.ai/openai
                                       Print all OpenAI endpoints + prices
  $ t2 services inspect https://mpp.t2000.ai/openai/v1/chat/completions
                                       Print just one endpoint's pricing
`,
    )
    .action(async (url: string, opts: ServicesInspectOptions) => {
      try {
        const catalog = await fetchCatalog({ gatewayUrl: opts.gateway });
        const match = findByUrl(catalog, url);

        if (!match) {
          if (isJsonMode()) {
            printJson({ url, found: false });
            process.exit(1);
            return;
          }
          printError(`No service matches ${url} in the gateway catalog.`);
          printInfo('Use `t2 services search "<query>"` to discover available services.');
          process.exit(1);
          return;
        }

        const { service, endpoint } = match;

        if (isJsonMode()) {
          printJson({
            url,
            found: true,
            service,
            endpoint: endpoint ?? null,
          });
          return;
        }

        printBlank();
        printKeyValue('Service', pc.bold(service.name));
        printKeyValue('URL', service.serviceUrl);
        printKeyValue('About', service.description);
        if (service.categories.length > 0) {
          printKeyValue('Categories', service.categories.join(', '));
        }
        printKeyValue('Currency', `${service.currency} on ${service.chain}`);

        if (endpoint) {
          printSeparator();
          renderEndpoint(endpoint, service.serviceUrl);
          printBlank();
          printInfo(`Pay with: \`t2 pay ${service.serviceUrl}${endpoint.path}\` (or use --estimate first).`);
        } else {
          printSeparator();
          printInfo(`${service.endpoints.length} endpoint${service.endpoints.length === 1 ? '' : 's'}:`);
          printBlank();
          for (const ep of service.endpoints) {
            renderEndpoint(ep, service.serviceUrl);
          }
          printInfo(`Pay with: \`t2 pay <one-of-the-urls-above>\` (or use --estimate first).`);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}

function renderEndpoint(ep: CatalogEndpoint, serviceUrl: string) {
  const price = `$${ep.price}`;
  const label = `${ep.method} ${ep.path}`.padEnd(40);
  printKeyValue(label, `${pc.green(price)}  ${pc.dim(ep.description)}`);
  printKeyValue('  url', `${serviceUrl}${ep.path}`);
  printBlank();
}
