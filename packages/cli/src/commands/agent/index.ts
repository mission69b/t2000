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
  printSuccess,
} from '../../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

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
      "Set this agent's public profile (name · image · description). Signed, no gas — shows in the directory.",
    )
    .option('--name <name>', 'Display name')
    .option('--image <url>', 'Image URL (https)')
    .option('--description <text>', 'Short description')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        name?: string;
        image?: string;
        description?: string;
        key?: string;
        api?: string;
      }) => {
        try {
          if (!(opts.name || opts.image || opts.description)) {
            throw new Error(
              'Provide at least one of --name, --image, --description.',
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
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        mcpEndpoint?: string;
        paymentMethods?: string;
        key?: string;
        api?: string;
      }) => {
        try {
          if (!(opts.mcpEndpoint || opts.paymentMethods)) {
            throw new Error(
              'Provide at least one of --mcp-endpoint, --payment-methods.',
            );
          }
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
          printKeyValue('Tx', String(digest));
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

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
