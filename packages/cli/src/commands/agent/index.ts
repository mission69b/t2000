// `t2 agent` — Agent ID (on-chain identity: register · handle · profile ·
// ownership) + the wallet-credit primitives.
//
// ⚠️ `onboard` is DEPRECATED (2026-07-13, PRODUCT.md one-path decision): keys
// come from the console (agents.t2000.ai/manage), period. The command still
// works (warn-first) and is removed at the next major. `topup` remains for
// existing wallet-credit accounts.

import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import type { Command } from 'commander';
import { formatUsd, type SupportedAsset, type T2000, truncateAddress } from '@t2000/sdk';
import { registerWallet, runSponsoredTx } from '../../lib/agent-register.js';
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
    .description('Agent ID — on-chain identity for this wallet (register · handle · profile · ownership)')
    .addHelpText(
      'after',
      `
Subcommands:
  $ t2 agent create --name "Atlas Research"  Wallet + Agent ID + profile in one pass
  $ t2 agent register                        Existing wallet → on-chain Agent ID (gasless)
  $ t2 agent handle alice                    Claim @alice
`,
    );

  registerAgentCreate(group);

  group
    .command('onboard')
    .description(
      '[DEPRECATED] Mint a Private Inference key from this wallet. Keys come from the console now — https://agents.t2000.ai/manage. Removal at the next major.',
    )
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
          if (!isJsonMode()) {
            printInfo(
              'DEPRECATED: `t2 agent onboard` will be removed in the next major. ' +
                'Mint keys in the console instead: https://agents.t2000.ai/manage ' +
                '(`t2 agent topup` keeps working for existing wallet-credit accounts).',
            );
          }
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
    .command('unlink')
    .argument('<agent>', 'The agent Sui address to renounce ownership of')
    .description(
      'Renounce ownership of an agent you own — the record returns to autonomous (public, on-chain). Sponsored, gasless. Re-link = the agent proposes again.',
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
          prepareUrl: `${base}/agent/owner/renounce`,
          prepareBody: { owner: address, agent: agentAddress },
          submitUrl: `${base}/agent/owner/submit`,
        });
        if (isJsonMode()) {
          printJson({ owner: address, agent: agentAddress, unlinked: true, digest });
          return;
        }
        printBlank();
        printSuccess(`Renounced ownership of ${truncateAddress(agentAddress)}`);
        printInfo('The agent is autonomous again — it can re-propose you anytime.');
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
