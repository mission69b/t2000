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
// Machines making one-off inference calls pay ASP x402 endpoints directly.

import type { Command } from 'commander';
import { truncateAddress } from '@t2000/sdk';
import {
  AGENT_CATEGORIES,
  ensureSellerCategory,
  parseCategory,
} from '../../lib/agent-category.js';
import { registerWallet } from '../../lib/agent-register.js';
import {
  assertSigningHostAllowed,
  assertTxMatchesIntent,
  isAllowUntrustedApi,
} from '../../lib/tx-guard.js';
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

async function fetchJson(
  url: string,
  init: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string })?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}

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

          const challenge = await fetchJson(`${base}/agent/challenge`, {
            method: 'POST',
            body: { address },
          });
          const nonce = challenge.nonce as string | undefined;
          if (!nonce) {
            throw new Error('Failed to get a challenge nonce.');
          }
          const message = new TextEncoder().encode(`t2000-agent-profile:${nonce}`);
          const { signature } = await agent.keypair.signPersonalMessage(message);

          await fetchJson(`${base}/agent/profile`, {
            method: 'POST',
            body: {
              address,
              nonce,
              signature,
              displayName: opts.name,
              imageUrl: opts.image,
              description: opts.description,
              category,
              website: opts.website,
              twitter: opts.twitter,
              github: opts.github,
            },
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

          // Two-phase sponsored flow, inline (not runSponsoredTx) so a failed
          // probe surfaces its per-check findings, not just one message.
          // Inline does NOT mean unguarded: the host pin runs before the
          // address is sent (S.930), and since S.1049 the prepared bytes are
          // intent-verified too — endpoint list/remove is a registry
          // `update`, and the guard's allowlist pins the MAINNET agent_id
          // package literal (the old comment calling that "theatre" predates
          // the registry joining ACTION_TARGETS).
          assertSigningHostAllowed(base, isAllowUntrustedApi());
          const prepRes = await fetch(`${base}/agent/endpoint/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address,
              endpoint: target,
              ...(opts.primary ? { primary: opts.primary } : {}),
            }),
          });
          const prep = (await prepRes.json().catch(() => ({}))) as {
            nonce?: string;
            txBytes?: string;
            probe?: {
              ok?: boolean;
              amount?: string | null;
              currency?: string | null;
              issues?: { message?: string; code?: string }[];
            } | null;
            origin?: string | null;
            primary?: { path?: string; url?: string } | null;
            routes?: {
              method?: string;
              path?: string;
              url?: string;
              priceUsdc?: string | null;
              summary?: string | null;
              probeOk?: boolean;
              issues?: { message?: string; code?: string }[];
            }[];
            issues?: { message?: string; code?: string }[];
            error?: { message?: string } | string;
          };
          if (!prepRes.ok) {
            const msg =
              typeof prep.error === 'string'
                ? prep.error
                : (prep.error?.message ?? `HTTP ${prepRes.status}`);
            // Origin expands carry per-route findings; single probes the
            // flat issue list. Show whichever came back.
            const lines: string[] = (prep.probe?.issues ?? []).map(
              (i) => `  ✗ ${i.message ?? i.code}`,
            );
            for (const r of prep.routes ?? []) {
              if (r.probeOk === false) {
                lines.push(`  ✗ ${r.method ?? 'POST'} ${r.path}`);
                for (const i of r.issues ?? []) {
                  lines.push(`      ${i.message ?? i.code}`);
                }
              }
            }
            const detail = lines.join('\n');
            throw new Error(detail ? `${msg}\n${detail}` : msg);
          }
          if (!(prep.nonce && prep.txBytes)) {
            throw new Error('Failed to prepare the listing.');
          }
          // S.1049: the server proposed; check it proposed a registry
          // `update` (endpoint prepare builds buildUpdateTx) before signing.
          assertTxMatchesIntent(
            prep.txBytes,
            { action: 'update' },
            { allowUntrusted: isAllowUntrustedApi() },
          );
          const bytes = new Uint8Array(Buffer.from(prep.txBytes, 'base64'));
          const { signature } = await agent.keypair.signTransaction(bytes);
          const sub = await fetchJson(`${base}/agent/endpoint/submit`, {
            method: 'POST',
            body: { nonce: prep.nonce, address, signature },
          });

          const primaryUrl = prep.primary?.url ?? target;
          if (isJsonMode()) {
            printJson({
              address,
              endpoint: opts.remove ? null : primaryUrl,
              listed: !opts.remove,
              probe: prep.probe ?? null,
              origin: prep.origin ?? null,
              primary: prep.primary ?? null,
              routes: prep.routes ?? [],
              digest: sub.digest,
            });
            return;
          }
          printBlank();
          if (opts.remove) {
            printSuccess('Listing removed.');
          } else {
            const routes = prep.routes ?? [];
            if (routes.length > 1) {
              printSuccess(
                `Listed — ${routes.length} paid routes are live on your public profile.`,
              );
              for (const r of routes) {
                const mark = r.path === prep.primary?.path ? '  (primary)' : '';
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
              if (prep.probe?.amount) {
                printKeyValue('Price', `${prep.probe.amount} USDC per call`);
              }
            }
            printKeyValue('Endpoint', primaryUrl);
            printInfo(`Buyers pay it with: t2 pay ${primaryUrl}`);
            printKeyValue('Profile', `https://t2000.ai/${address}`);
          }
          printKeyValue('Tx', String(sub.digest));
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
