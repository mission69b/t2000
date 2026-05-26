// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// `t2 services search "<query>"` — case-insensitive substring search
// over the MPP gateway service catalog.

import type { Command } from 'commander';
import pc from 'picocolors';
import { fetchCatalog, filterCatalog, type CatalogService } from './catalog.js';
import {
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printSeparator,
  isJsonMode,
  handleError,
} from '../../output.js';

export interface ServicesSearchOptions {
  gateway?: string;
  limit?: string;
}

export function registerServicesSearch(parent: Command) {
  parent
    .command('search')
    .description('Search the MPP gateway catalog by name, category, or endpoint description')
    .argument('<query>', 'Search query (case-insensitive substring match)')
    .option('--gateway <url>', 'Override gateway base URL (default: https://mpp.t2000.ai)')
    .option('--limit <n>', 'Limit number of results (default: 10)', '10')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 services search "image"            Find image-generation services
  $ t2 services search "chat"             Find chat / completion endpoints
  $ t2 services search "weather"          Find weather APIs
`,
    )
    .action(async (query: string, opts: ServicesSearchOptions) => {
      try {
        const limit = parseInt(opts.limit ?? '10', 10);
        if (!Number.isFinite(limit) || limit <= 0) {
          throw new Error(`Invalid --limit value: "${opts.limit}". Must be a positive integer.`);
        }

        const catalog = await fetchCatalog({ gatewayUrl: opts.gateway });
        const matches = filterCatalog(catalog, query).slice(0, limit);

        if (isJsonMode()) {
          printJson({ query, count: matches.length, services: matches });
          return;
        }

        if (matches.length === 0) {
          printBlank();
          printInfo(`No services match "${query}".`);
          printInfo('Try a broader query or `t2 services search ""` to list all.');
          printBlank();
          return;
        }

        printBlank();
        printInfo(`${matches.length} service${matches.length === 1 ? '' : 's'} matching "${query}":`);
        printBlank();
        for (const svc of matches) {
          renderServiceLine(svc);
        }
        printSeparator();
        printInfo('Use `t2 services inspect <url>` to see pricing + endpoints for a service.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}

function renderServiceLine(svc: CatalogService) {
  const minPrice = cheapestEndpointPrice(svc);
  const priceTag = minPrice !== null ? pc.green(`from $${minPrice}`) : pc.dim('no pricing');
  const catTag = svc.categories.length > 0 ? pc.dim(`[${svc.categories.join(', ')}]`) : '';
  printKeyValue(pc.bold(svc.name), `${priceTag}  ${catTag}`);
  printKeyValue('  url', svc.serviceUrl);
  printKeyValue('  about', svc.description);
  printBlank();
}

function cheapestEndpointPrice(svc: CatalogService): string | null {
  if (svc.endpoints.length === 0) return null;
  const prices = svc.endpoints
    .map((ep) => parseFloat(ep.price))
    .filter((n) => Number.isFinite(n));
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  return min.toFixed(min < 0.01 ? 4 : min < 1 ? 3 : 2);
}
