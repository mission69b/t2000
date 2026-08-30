// `t2 agent` — Agent ID (on-chain identity: register · profile · sell).
// OWNERSHIP left the product 2026-08-13 (S.1032): `link` / `confirm` /
// `unlink` and `create --owner` are gone — agents are autonomous Agent IDs;
// a Passport's own registration IS its agent (Verified = paid Passport
// self-agent). The registry mutators abort on-chain since v2.
// The `handle` command (agent-id.sui SuiNS leaves) was removed 2026-08-04
// (SPEC_T2_KILL_AGENT_ID_LEAF — humans hold @audric; agents are name + #id
// + 0x). Identity only: the `onboard`/`topup` wallet-credit commands
// were removed 2026-07-13 (PRODUCT.md one-path decision) and `tokenize` was
// removed 2026-08-01 (SPEC_T2_CLEANUP_USDC_ONLY — the store is a USDC
// economy; the SDK builders were deleted 2026-08-03 — on-chain
// `agent_capital` remains historical only).
// Machines making one-off inference calls pay seller x402 endpoints directly.

import type { Command } from 'commander';
import { truncateAddress } from '@t2000/sdk';
import {
  AGENT_CATEGORIES,
  ensureSellerCategory,
  parseCategory,
} from '../../lib/agent-category.js';
import { registerWallet } from '../../lib/agent-register.js';
import { commerceFor } from '../../lib/commerce-client.js';
import { humanProfileUrl, profileLine } from '../../lib/profile-url.js';
import { withAgent } from '../../lib/with-agent.js';
import { registerAgentCreate } from './create.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printSuccess,
} from '../../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

export function registerAgent(program: Command) {
  const group = program
    .command('agent')
    .description('Agent ID — on-chain identity for this wallet (register · profile · sell)')
    .addHelpText(
      'after',
      `
Subcommands:
  $ t2 agent create --name "Atlas Research"  Wallet + Agent ID + profile in one pass
  $ t2 agent register                        Existing wallet → on-chain Agent ID (gasless)
  $ t2 agent sell https://api.me.com/v1/x    Sell it as an x402 Service (live-probed, gasless)
`,
    );

  registerAgentCreate(group);

  group
    .command('register')
    .description(
      'Register this wallet on-chain as an Agent ID (sponsored, gasless). Idempotent — safe to re-run.',
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();
        const reg = await registerWallet({ keypair: agent.keypair, address, base });

        if (isJsonMode()) {
          printJson({
            address,
            registered: true,
            alreadyRegistered: reg.alreadyRegistered,
            digest: reg.digest,
          });
          return;
        }
        printBlank();
        printSuccess(
          reg.alreadyRegistered
            ? 'Already registered as an Agent ID'
            : 'Registered as an Agent ID',
        );
        printKeyValue('Address', truncateAddress(address));
        if (reg.digest) {
          printKeyValue('Tx', reg.digest);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('profile')
    .description(
      "Set this agent's public profile (name · image · description · links). Signed, no gas — shows in the directory.",
    )
    .option('--name <name>', 'Display name')
    .option('--image <url>', 'Image URL (https)')
    .option('--description <text>', 'Short description')
    .option(
      '--category <category>',
      `Directory category: ${AGENT_CATEGORIES.join(' | ')}`,
    )
    .option('--website <url>', 'Website link (https)')
    .option('--twitter <url>', 'X / Twitter link (https)')
    .option('--github <url>', 'GitHub link (https)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        name?: string;
        image?: string;
        description?: string;
        category?: string;
        website?: string;
        twitter?: string;
        github?: string;
        key?: string;
        api?: string;
      }) => {
        try {
          if (
            !(
              opts.name ||
              opts.image ||
              opts.description ||
              opts.category ||
              opts.website ||
              opts.twitter ||
              opts.github
            )
          ) {
            throw new Error(
              'Provide at least one of --name, --image, --description, --category, --website, --twitter, --github.',
            );
          }
          const category =
            opts.category === undefined
              ? undefined
              : parseCategory(opts.category);
          const base = opts.api ?? DEFAULT_API_BASE;
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();

          // Signed challenge, no gas — the SDK commerce SSOT (S.1158).
          await commerceFor(agent, base).updateProfile({
            name: opts.name,
            imageUrl: opts.image,
            description: opts.description,
            category,
            website: opts.website,
            twitter: opts.twitter,
            github: opts.github,
          });

          if (isJsonMode()) {
            printJson({ address, updated: true });
            return;
          }
          printBlank();
          printSuccess('Profile updated.');
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('sell')
    .argument(
      '[endpoint]',
      'Your API origin (https://api.example.com — every paid route in its openapi.json gets listed) or one x402 route URL. Omit with --remove to clear the listing.',
    )
    .description(
      'List your x402 API on your public Agent ID profile. An origin expands via {origin}/openapi.json — every paid route is live-probed (must answer 402 with a Sui payment challenge) and becomes a store card; a single 402 URL lists just that route. Then set on-chain — sponsored, gasless. Same flow as the console\u2019s "Sell your API".',
    )
    .option('--remove', 'Remove the listing instead')
    .option(
      '--primary <path>',
      'Route to record as the on-chain primary endpoint (default: the cheapest paid route)',
    )
    .option(
      '--category <category>',
      `Directory category for your listing: ${AGENT_CATEGORIES.join(' | ')} (required unless already set on your profile)`,
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (
        endpoint: string | undefined,
        opts: {
          remove?: boolean;
          primary?: string;
          category?: string;
          key?: string;
          api?: string;
        },
      ) => {
        try {
          if (!(opts.remove || endpoint)) {
            throw new Error(
              'Provide your x402 endpoint URL (or --remove to clear the listing).',
            );
          }
          // Validate BEFORE wallet load (the S.816 CI lesson).
          const category =
            opts.category === undefined
              ? undefined
              : parseCategory(opts.category);
          const base = opts.api ?? DEFAULT_API_BASE;
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();
          const target = opts.remove ? '' : (endpoint as string);

          // Listings become browsable cards — a category is part of listing
          // (the directory-drift guard; removals skip it).
          if (!opts.remove) {
            await ensureSellerCategory({ base, agent, category });
          }

          // SDK commerce SSOT (S.1158): prepare (live probe) → guard → sign
          // → submit. A failed probe surfaces its per-route findings in the
          // error message. The S.930 locks run through the installed
          // sponsored-tx guard — host pin before the address is sent, and the
          // bytes intent-checked as a registry `update` (the allowlist pins
          // the MAINNET agent_id package literal).
          const client = commerceFor(agent, base);
          const listing = opts.remove
            ? await client.removeEndpoint()
            : await client.listEndpoint(target, {
                ...(opts.primary ? { primary: opts.primary } : {}),
              });
          const primaryUrl = listing.endpoint ?? target;
          if (isJsonMode()) {
            printJson({
              address,
              endpoint: opts.remove ? null : primaryUrl,
              listed: !opts.remove,
              probe: listing.probe ?? null,
              origin: listing.origin ?? null,
              primary: listing.primary ?? null,
              routes: listing.routes ?? [],
              digest: listing.digest,
            });
            return;
          }
          printBlank();
          if (opts.remove) {
            printSuccess('Listing removed.');
          } else {
            const routes = listing.routes ?? [];
            if (routes.length > 1) {
              printSuccess(
                `Listed — ${routes.length} paid routes are live on your public profile.`,
              );
              for (const r of routes) {
                const mark = r.path === listing.primary?.path ? '  (primary)' : '';
                const price = r.priceUsdc ? `${r.priceUsdc} USDC` : '?';
                printKeyValue(
                  `  ${r.method ?? 'POST'} ${r.path}`,
                  `${price}${mark}`,
                );
              }
            } else {
              printSuccess(
                'Listed — your endpoint is live on your public profile.',
              );
              if (listing.probe?.amount) {
                printKeyValue('Price', `${listing.probe.amount} USDC per call`);
              }
            }
            printKeyValue('Endpoint', primaryUrl);
            printInfo(`Buyers pay it with: t2 pay ${primaryUrl}`);
            // S.1248: human pages are numeric-only — never a 0x path.
            printKeyValue(
              'Profile',
              profileLine(await humanProfileUrl(base, address)),
            );
          }
          printKeyValue('Tx', String(listing.digest));
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
