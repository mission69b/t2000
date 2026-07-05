// `t2 agent onboard` — headless agent onboarding to the t2000 Private API
// (Agent ID Phase A). This wallet's keypair becomes a first-class t2000
// account: fund credit with gasless USDC/USDsui, then mint an API key — all
// without a browser/zkLogin.
//
// The loop (mirrors the /v1/agent/* endpoints):
//   1. (optional) --fund: send stablecoin → the server's treasury → POST topup
//      (the on-chain deposit self-authenticates the credit).
//   2. GET a challenge nonce → sign it as a personal message with the keypair.
//   3. POST it to mint an API key (returned once).

import { createHash } from 'node:crypto';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import type { Command } from 'commander';
import { formatUsd, type SupportedAsset, type T2000, truncateAddress } from '@t2000/sdk';
import { registerWallet, runSponsoredTx } from '../../lib/agent-register.js';
import { withAgent } from '../../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
} from '../../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';
const DEFAULT_GATEWAY = process.env.T2000_GATEWAY_URL ?? 'https://mpp.t2000.ai';
// The PUBLIC-facing rail domain shown on agent profiles (same gateway as
// DEFAULT_GATEWAY, aliased). x402 is the recognizable protocol brand for a
// payable endpoint; it matches the SDK's x402.t2000.ai pay URLs.
const DEFAULT_RAIL = process.env.T2000_RAIL_URL ?? 'https://x402.t2000.ai';

// The curated storefront categories (agents.t2000.ai chips). Mirrors the
// server-side allow-list — the API rejects anything else, this just fails fast
// with a clear message before signing.
const AGENT_CATEGORIES = [
  'ai-models',
  'data-feeds',
  'finance',
  'research',
  'dev-tools',
  'creative',
  'other',
] as const;

/** Validate + lowercase a `--category` value (undefined passes through). */
function normalizeCategory(input: string | undefined): string | undefined {
  if (input === undefined) {
    return;
  }
  const c = input.trim().toLowerCase();
  if (!(AGENT_CATEGORIES as readonly string[]).includes(c)) {
    throw new Error(
      `--category must be one of: ${AGENT_CATEGORIES.join(', ')} (got "${input}").`,
    );
  }
  return c;
}

/** Collect repeatable `--header k=v` flags into an object. */
function collectHeader(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const [key, ...rest] = value.split('=');
  if (key && rest.length > 0) {
    previous[key.trim()] = rest.join('=').trim();
  }
  return previous;
}

function normalizeTopupAsset(input: string | undefined): 'USDC' | 'USDsui' {
  return input?.toLowerCase() === 'usdsui' ? 'USDsui' : 'USDC';
}

/**
 * Send a gasless stablecoin deposit to the server's treasury and credit it —
 * the shared funding step behind both `onboard --fund` and `topup`. This is
 * the "never runs dry" primitive: an agent calls `t2 agent topup` (on a 402
 * from /v1, or on a schedule) to refill its own credit from its wallet.
 */
async function fundCredit(
  agent: T2000,
  base: string,
  amountStr: string,
  assetOpt: string | undefined,
): Promise<{ amount: number; asset: 'USDC' | 'USDsui'; balanceUsd: unknown }> {
  const amount = Number.parseFloat(amountStr);
  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error(`amount must be a positive number (got "${amountStr}").`);
  }
  const asset = normalizeTopupAsset(assetOpt);

  const cfg = await fetchJson(`${base}/agent/topup`, { method: 'GET' });
  const treasury = cfg.treasury as string | undefined;
  if (!treasury) {
    throw new Error('Could not resolve the t2000 treasury address.');
  }

  const sent = await agent.send({ to: treasury, amount, asset: asset as SupportedAsset });
  const topup = await fetchJson(`${base}/agent/topup`, {
    method: 'POST',
    body: { address: agent.address(), digest: sent.tx },
  });
  return { amount, asset, balanceUsd: topup.balanceUsd };
}

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
    .description('Agent ID — onboard this wallet to the t2000 API (api.t2000.ai)')
    .addHelpText(
      'after',
      `
Subcommands:
  $ t2 agent onboard --fund 5               Fund 5 USDC → mint an API key (ready to call)
  $ t2 agent onboard --fund 5 --asset USDsui
  $ t2 agent onboard                        Already funded → just mint a key
`,
    );

  group
    .command('onboard')
    .description('Fund credit (gasless USDC/USDsui) + mint an API key for this wallet.')
    .option('--fund <amount>', 'Stablecoin amount to deposit as credit (omit if already funded)')
    .option('--asset <asset>', 'USDC (default) or USDsui', 'USDC')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        fund?: string;
        asset?: string;
        key?: string;
        api?: string;
      }) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();

          // 1. Optional funding: send stablecoin to the treasury, then credit it.
          if (opts.fund !== undefined) {
            const funded = await fundCredit(agent, base, opts.fund, opts.asset);
            if (!isJsonMode()) {
              printSuccess(
                `Funded ${formatUsd(funded.amount)} ${funded.asset} → credit $${funded.balanceUsd}`,
              );
            }
          }

          // 2. Challenge → sign → mint key.
          const challenge = await fetchJson(`${base}/agent/challenge`, {
            method: 'POST',
            body: { address },
          });
          const nonce = challenge.nonce as string | undefined;
          if (!nonce) {
            throw new Error('Failed to get a challenge nonce.');
          }

          const message = new TextEncoder().encode(`t2000-agent-keys:${nonce}`);
          const { signature } = await agent.keypair.signPersonalMessage(message);

          const minted = await fetchJson(`${base}/agent/keys`, {
            method: 'POST',
            body: { address, nonce, signature },
          });
          const key = minted.key as string | undefined;
          if (!key) {
            throw new Error('Failed to mint an API key.');
          }

          // 3. Ensure an on-chain Agent ID (sponsored/gasless, idempotent).
          //    Best-effort: a sponsor-empty / transient failure must not fail
          //    onboarding — the identity registers on a later run.
          let registered = false;
          try {
            await registerWallet({ keypair: agent.keypair, address, base });
            registered = true;
          } catch {
            // best-effort
          }

          if (isJsonMode()) {
            printJson({ address, apiKey: key, baseUrl: base, registered });
            return;
          }
          printBlank();
          printSuccess('Agent onboarded — API key minted (shown once, store it now)');
          printKeyValue('Address', truncateAddress(address));
          printKeyValue('API key', key);
          printKeyValue(
            'Agent ID',
            registered ? 'registered' : 'pending (retry: t2 agent register)',
          );
          printKeyValue('Base URL', base);
          printBlank();
          printInfo(`export OPENAI_BASE_URL=${base}  OPENAI_API_KEY=${key}`);
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('topup')
    .argument('<amount>', 'Stablecoin amount to deposit as credit')
    .description(
      "Top up this wallet's t2000 credit with gasless USDC/USDsui (no new key). The 'never runs dry' primitive — call it on a 402 or a schedule.",
    )
    .option('--asset <asset>', 'USDC (default) or USDsui', 'USDC')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (
        amount: string,
        opts: { asset?: string; key?: string; api?: string },
      ) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;
          const agent = await withAgent({ keyPath: opts.key });
          const funded = await fundCredit(agent, base, amount, opts.asset);

          if (isJsonMode()) {
            printJson({
              address: agent.address(),
              funded: funded.amount,
              asset: funded.asset,
              balanceUsd: funded.balanceUsd,
            });
            return;
          }
          printBlank();
          printSuccess(
            `Topped up ${formatUsd(funded.amount)} ${funded.asset} → credit $${funded.balanceUsd}`,
          );
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

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
    .command('link')
    .argument('<owner>', "The owner's Sui address (Passport) to propose")
    .description(
      "Propose an owner for this agent (two-sided — the owner must then confirm). Sponsored, gasless.",
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (owner: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();
        // Guard: `owner` is the human Passport, not the agent's own address — a
        // self-link is the common mistake (and a no-op you'd then have to undo).
        if (!isValidSuiAddress(owner)) {
          throw new Error(
            'Provide a valid Sui address for the owner (your Passport, e.g. 0x…).',
          );
        }
        if (normalizeSuiAddress(owner) === normalizeSuiAddress(address)) {
          throw new Error(
            "That's this agent's own address. Pass YOUR Passport address (the human owner) — e.g. the one shown in agents.t2000.ai/manage.",
          );
        }
        const { digest } = await runSponsoredTx({
          keypair: agent.keypair,
          actor: address,
          prepareUrl: `${base}/agent/owner/propose`,
          prepareBody: { address, owner },
          submitUrl: `${base}/agent/owner/submit`,
        });
        if (isJsonMode()) {
          printJson({ agent: address, pendingOwner: owner, digest });
          return;
        }
        printBlank();
        printSuccess(`Proposed owner: ${truncateAddress(owner)}`);
        printInfo(
          `They must confirm: \`t2 agent confirm ${address}\` (or via the console).`,
        );
        printKeyValue('Tx', String(digest));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('confirm')
    .argument('<agent>', 'The agent Sui address to confirm ownership of')
    .description(
      'Confirm ownership of an agent that proposed you as its owner. Sponsored, gasless.',
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (agentAddress: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const owner = await withAgent({ keyPath: opts.key });
        const address = owner.address();
        const { digest } = await runSponsoredTx({
          keypair: owner.keypair,
          actor: address,
          prepareUrl: `${base}/agent/owner/confirm`,
          prepareBody: { owner: address, agent: agentAddress },
          submitUrl: `${base}/agent/owner/submit`,
        });
        if (isJsonMode()) {
          printJson({ owner: address, agent: agentAddress, digest });
          return;
        }
        printBlank();
        printSuccess(`Confirmed ownership of ${truncateAddress(agentAddress)}`);
        printKeyValue('Tx', String(digest));
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
              opts.website ||
              opts.twitter ||
              opts.github
            )
          ) {
            throw new Error(
              'Provide at least one of --name, --image, --description, --website, --twitter, --github.',
            );
          }
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
    .command('service')
    .description(
      "Declare this agent's paid service — an MCP endpoint + accepted payment methods (e.g. x402). Sponsored, gasless. Lights up Service / x402 in the directory.",
    )
    .option('--mcp-endpoint <url>', 'Your agent service endpoint (https)')
    .option(
      '--payment-methods <list>',
      'Comma-separated methods you accept, e.g. "x402"',
    )
    .option('--price <usdc>', 'Price per call in USDC (e.g. 0.02) — buyers pay this')
    .option(
      '--category <category>',
      `Storefront category: ${AGENT_CATEGORIES.join(' | ')}`,
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        mcpEndpoint?: string;
        paymentMethods?: string;
        price?: string;
        category?: string;
        key?: string;
        api?: string;
      }) => {
        try {
          if (
            opts.mcpEndpoint === undefined &&
            opts.paymentMethods === undefined &&
            opts.price === undefined &&
            opts.category === undefined
          ) {
            throw new Error(
              'Provide at least one of --mcp-endpoint, --payment-methods, --price, --category. (Pass --mcp-endpoint "" to clear your endpoint.)',
            );
          }
          if (opts.price !== undefined) {
            const p = Number.parseFloat(opts.price);
            if (Number.isNaN(p) || p <= 0) {
              throw new Error(`--price must be a positive number (got "${opts.price}").`);
            }
          }
          const category = normalizeCategory(opts.category);
          const base = opts.api ?? DEFAULT_API_BASE;
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();

          // Only send the fields actually provided — the server merges the rest
          // (the on-chain `update` is full-replace).
          const prepareBody: Record<string, unknown> = { address };
          if (opts.mcpEndpoint !== undefined) {
            prepareBody.mcpEndpoint = opts.mcpEndpoint;
          }
          if (opts.paymentMethods !== undefined) {
            prepareBody.paymentMethods = opts.paymentMethods
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          }
          if (opts.price !== undefined) {
            prepareBody.priceUsdc = opts.price;
          }
          if (category !== undefined) {
            prepareBody.category = category;
          }

          const { digest } = await runSponsoredTx({
            keypair: agent.keypair,
            actor: address,
            prepareUrl: `${base}/agent/service/prepare`,
            prepareBody,
            submitUrl: `${base}/agent/service/submit`,
          });

          if (isJsonMode()) {
            printJson({ address, updated: true, digest });
            return;
          }
          printBlank();
          printSuccess('Service declared — showing in the directory.');
          if (opts.mcpEndpoint) {
            printKeyValue('MCP endpoint', opts.mcpEndpoint);
          }
          if (opts.paymentMethods) {
            printKeyValue('Payment methods', opts.paymentMethods);
          }
          if (opts.price) {
            printKeyValue('Price', `$${opts.price} USDC`);
          }
          if (category) {
            printKeyValue('Category', category);
          }
          printKeyValue('Tx', String(digest));
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('deploy')
    .description(
      "Deploy a paid service by wrapping any HTTP API — t2000 hosts the proxy (your key stays server-side, encrypted), lists it, and settles payments. No server needed. Use --remove to take it down. [Agent Commerce]",
    )
    .option('--upstream <url>', 'The upstream API URL to wrap (https)')
    .option(
      '--header <k=v>',
      'Header to inject into upstream calls (repeatable; e.g. your API key)',
      collectHeader,
      {},
    )
    .option('--method <method>', 'Upstream method: GET or POST (default POST)')
    .option('--price <usdc>', 'Price per call in USDC (e.g. 0.02)')
    .option(
      '--category <category>',
      `Storefront category: ${AGENT_CATEGORIES.join(' | ')}`,
    )
    .option('--remove', 'Take down the deployed service')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        upstream?: string;
        header?: Record<string, string>;
        method?: string;
        price?: string;
        category?: string;
        remove?: boolean;
        gateway?: string;
        key?: string;
        api?: string;
      }) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const category = normalizeCategory(opts.category);
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();

          if (opts.remove) {
            const ts = Date.now();
            const msg = `t2000-deploy-remove:${ts}`;
            const { signature } = await agent.keypair.signPersonalMessage(
              new TextEncoder().encode(msg),
            );
            await fetchJson(`${gateway}/deploy/config`, {
              method: 'DELETE',
              body: { address, timestamp: ts, signature },
            });
            // Clear the directory endpoint (keeps price/x402; pass "" to clear).
            await runSponsoredTx({
              keypair: agent.keypair,
              actor: address,
              prepareUrl: `${base}/agent/service/prepare`,
              prepareBody: { address, mcpEndpoint: '' },
              submitUrl: `${base}/agent/service/submit`,
            }).catch(() => undefined);
            if (isJsonMode()) {
              printJson({ address, removed: true });
              return;
            }
            printBlank();
            printSuccess('Service taken down.');
            printBlank();
            return;
          }

          if (!(opts.upstream && opts.price)) {
            throw new Error('Both --upstream and --price are required (or use --remove).');
          }
          const price = Number.parseFloat(opts.price);
          if (Number.isNaN(price) || price <= 0) {
            throw new Error(`--price must be a positive number (got "${opts.price}").`);
          }
          const method =
            (opts.method ?? 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
          const headers = opts.header ?? {};

          // 1. Store the proxy config (signed, config-bound, headers encrypted).
          const ts = Date.now();
          const bodyHash = createHash('sha256')
            .update(`${opts.upstream}|${method}|${JSON.stringify(headers)}`)
            .digest('hex');
          const msg = `t2000-deploy:${ts}:${bodyHash}`;
          const { signature } = await agent.keypair.signPersonalMessage(
            new TextEncoder().encode(msg),
          );
          await fetchJson(`${gateway}/deploy/config`, {
            method: 'POST',
            body: {
              address,
              timestamp: ts,
              signature,
              upstreamUrl: opts.upstream,
              method,
              headers,
            },
          });

          // 2. List it in the directory (price + x402 + a hosted endpoint marker).
          const { digest } = await runSponsoredTx({
            keypair: agent.keypair,
            actor: address,
            prepareUrl: `${base}/agent/service/prepare`,
            prepareBody: {
              address,
              // The real, x402-callable buy endpoint (GET → 402 + requirements,
              // pay → collect/deliver/forward). `/deploy/<addr>` was a phantom
              // (no route → 404). Any x402 client can hit this URL.
              mcpEndpoint: `${DEFAULT_RAIL}/commerce/pay/${address}`,
              paymentMethods: ['x402'],
              priceUsdc: opts.price,
              ...(category ? { category } : {}),
            },
            submitUrl: `${base}/agent/service/submit`,
          });

          if (isJsonMode()) {
            printJson({ address, upstream: opts.upstream, price, digest });
            return;
          }
          printBlank();
          printSuccess('Service deployed — live + listed in the directory.');
          printKeyValue('Wraps', opts.upstream);
          printKeyValue('Price', `$${opts.price} USDC`);
          if (category) {
            printKeyValue('Category', category);
          }
          printKeyValue('Tx', String(digest));
          printInfo(`Buyers: t2 agent pay ${truncateAddress(address)}`);
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('pay')
    .argument('<seller>', "The seller agent's Sui address")
    .description(
      'Pay a seller agent for a service (gateway-mediated, USDC). t2000 collects, keeps a small fee, and forwards the rest to the seller — with a receipt. [Agent Commerce]',
    )
    .option('--amount <usdc>', "Override the price (default: the seller's declared price)")
    .option('--data <json>', "Service input forwarded to the seller's endpoint")
    .option('--max-price <usdc>', 'Max USDC to auto-approve (default 1.00, or --amount)')
    .option(
      '--gateway <url>',
      `Gateway base URL (default ${DEFAULT_GATEWAY})`,
    )
    .option('--force', 'Override spending limits for this call (see `t2 limit`)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(
      async (
        seller: string,
        opts: {
          amount?: string;
          data?: string;
          maxPrice?: string;
          gateway?: string;
          force?: boolean;
          key?: string;
        },
      ) => {
        try {
          if (opts.amount !== undefined) {
            const a = Number.parseFloat(opts.amount);
            if (Number.isNaN(a) || a <= 0) {
              throw new Error(`--amount must be a positive number (got "${opts.amount}").`);
            }
          }
          // Auto-approve ceiling. With no --amount, the seller's declared price
          // is paid (≤ this ceiling).
          const maxPrice = opts.maxPrice
            ? Number.parseFloat(opts.maxPrice)
            : opts.amount
              ? Number.parseFloat(opts.amount)
              : 1.0;
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const agent = await withAgent({ keyPath: opts.key });
          // Names welcome (S.639): `t2 agent pay funkii.audric.sui` / `@funkii`
          // resolve exactly like `t2 send` (hex → SuiNS → @audric handle).
          const resolvedSeller = seller.startsWith('0x')
            ? seller
            : (await agent.resolveRecipient(seller)).address;
          const url = opts.amount
            ? `${gateway}/commerce/pay/${resolvedSeller}?amount=${encodeURIComponent(opts.amount)}`
            : `${gateway}/commerce/pay/${resolvedSeller}`;

          const result = await agent.pay({
            url,
            method: 'POST',
            body: opts.data,
            maxPrice,
            force: opts.force,
          });
          const body = result.body as
            | {
                error?: string;
                receipt?: {
                  grossMicros?: number;
                  authorizedMicros?: number;
                  chargedMicros?: number;
                  refundMicros?: number;
                  netMicros?: number;
                  feeMicros?: number;
                  forwardDigest?: string;
                  delivered?: boolean;
                };
                response?: unknown;
              }
            | undefined;
          // Fail LOUDLY on a non-2xx — never print "✓ Paid" for a request
          // that didn't pay (S.639: a 400 used to render as "Paid $0.00").
          if (result.status >= 400) {
            throw new Error(
              `${body?.error ?? `Request failed (HTTP ${result.status})`}${result.paid ? '' : ' — nothing was paid.'}`,
            );
          }
          const receipt = body?.receipt;
          // What the buyer actually paid: chargedMicros (usage-based) →
          // grossMicros (fixed) → fallbacks.
          const chargedMicros = receipt?.chargedMicros ?? receipt?.grossMicros;
          const paidUsd =
            typeof chargedMicros === 'number'
              ? chargedMicros / 1_000_000
              : opts.amount
                ? Number.parseFloat(opts.amount)
                : (result.cost ?? 0);

          if (isJsonMode()) {
            printJson({
              seller: resolvedSeller,
              amount: paidUsd,
              paid: result.paid,
              cost: result.cost,
              receipt,
              response: body?.response,
            });
            return;
          }
          printBlank();
          printSuccess(
            `Paid ${formatUsd(paidUsd)} to ${seller.startsWith('0x') ? truncateAddress(seller) : `${seller} (${truncateAddress(resolvedSeller)})`}`,
          );
          if (receipt) {
            // Usage-based: show what was authorized vs actually charged + refund.
            if (
              typeof receipt.refundMicros === 'number' &&
              receipt.refundMicros > 0 &&
              typeof receipt.authorizedMicros === 'number'
            ) {
              printKeyValue(
                'Authorized',
                `$${(receipt.authorizedMicros / 1_000_000).toFixed(6)}`,
              );
              printKeyValue('Charged', `$${paidUsd.toFixed(6)}`);
              printKeyValue('Refunded', `$${(receipt.refundMicros / 1_000_000).toFixed(6)}`);
            }
            if (typeof receipt.netMicros === 'number') {
              printKeyValue('Seller received', `$${(receipt.netMicros / 1_000_000).toFixed(6)}`);
            }
            if (typeof receipt.feeMicros === 'number') {
              printKeyValue('Facilitator fee', `$${(receipt.feeMicros / 1_000_000).toFixed(6)}`);
            }
            if (receipt.forwardDigest) {
              printKeyValue('Settlement tx', receipt.forwardDigest);
            }
          }
          if (body?.response !== undefined) {
            printBlank();
            printInfo('Service response:');
            printLine(JSON.stringify(body.response, null, 2));
          }
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('earnings')
    .description(
      "Your sales as a seller — count, USDC earned (net), and unique buyers, from the on-chain settlement ledger. [Agent Commerce]",
    )
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: { gateway?: string; key?: string }) => {
      try {
        const gateway = opts.gateway ?? DEFAULT_GATEWAY;
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();
        const stats = (await fetchJson(
          `${gateway}/commerce/stats/${address}`,
          { method: 'GET' },
        )) as {
          sales?: number;
          volumeUsd?: number;
          buyers?: number;
          lastSaleAt?: string | null;
        };

        if (isJsonMode()) {
          printJson({ address, ...stats });
          return;
        }
        printBlank();
        printSuccess(`Earnings for ${truncateAddress(address)}`);
        printKeyValue('Sales', String(stats.sales ?? 0));
        printKeyValue('Earned (net)', `$${(stats.volumeUsd ?? 0).toFixed(6)} USDC`);
        printKeyValue('Unique buyers', String(stats.buyers ?? 0));
        if (stats.lastSaleAt) {
          printKeyValue('Last sale', new Date(stats.lastSaleAt).toISOString());
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('handle')
    .argument('<label>', 'Handle label (3–20 chars: lowercase a–z, 0–9, hyphens)')
    .description(
      'Claim <label>.agent-id.sui → this wallet (custody-minted, gasless). Use --release to give it up.',
    )
    .option('--release', 'Release (revoke) this handle instead of claiming it')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (
        label: string,
        opts: { release?: boolean; key?: string; api?: string },
      ) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();

          // Challenge → sign (bound to nonce + label, action-prefixed).
          const challenge = await fetchJson(`${base}/agent/challenge`, {
            method: 'POST',
            body: { address },
          });
          const nonce = challenge.nonce as string | undefined;
          if (!nonce) {
            throw new Error('Failed to get a challenge nonce.');
          }
          const action = opts.release
            ? 't2000-agent-handle-release'
            : 't2000-agent-handle';
          const message = new TextEncoder().encode(`${action}:${nonce}:${label}`);
          const { signature } = await agent.keypair.signPersonalMessage(message);

          const path = opts.release ? '/agent/handle/release' : '/agent/handle';
          const res = await fetchJson(`${base}${path}`, {
            method: 'POST',
            body: { address, label, nonce, signature },
          });

          if (isJsonMode()) {
            printJson({ address, ...res });
            return;
          }
          printBlank();
          if (opts.release) {
            printSuccess(`Handle released: ${String(res.handle)}`);
          } else {
            printSuccess(`Handle claimed: ${String(res.display)}`);
            printKeyValue('Handle', String(res.handle));
          }
          printKeyValue('Address', truncateAddress(address));
          printKeyValue('Tx', String(res.digest));
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
