// `t2 agent` — Agent ID (on-chain identity: register · handle · profile ·
// ownership). Identity only: API keys come from the console
// (agents.t2000.ai/manage) — the `onboard`/`topup` wallet-credit commands were
// removed 2026-07-13 (PRODUCT.md one-path decision); machines making one-off
// inference calls use keyless x402 on the gateway.

import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import type { Command } from 'commander';
import { truncateAddress } from '@t2000/sdk';
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
const DEFAULT_GATEWAY_BASE = process.env.T2000_GATEWAY_URL ?? 'https://mpp.t2000.ai';

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
  $ t2 agent sell https://api.me.com/v1/x    List your x402 endpoint (live-probed, gasless)
  $ t2 agent list-catalog                    Also list it in the MPP catalog (machine-gated)
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
    .command('sell')
    .argument(
      '[endpoint]',
      'Your x402 endpoint URL (https). Omit with --remove to clear the listing.',
    )
    .description(
      'List your x402 endpoint on your public Agent ID profile. The endpoint is live-probed (must answer 402 with a Sui payment challenge), then set on-chain — sponsored, gasless. Same flow as the console\u2019s "Sell your API".',
    )
    .option('--remove', 'Remove the listing instead')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (
        endpoint: string | undefined,
        opts: { remove?: boolean; key?: string; api?: string },
      ) => {
        try {
          if (!(opts.remove || endpoint)) {
            throw new Error(
              'Provide your x402 endpoint URL (or --remove to clear the listing).',
            );
          }
          const base = opts.api ?? DEFAULT_API_BASE;
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();
          const target = opts.remove ? '' : (endpoint as string);

          // Two-phase sponsored flow, inline (not runSponsoredTx) so a failed
          // probe surfaces its per-check findings, not just one message.
          const prepRes = await fetch(`${base}/agent/endpoint/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, endpoint: target }),
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
            error?: { message?: string } | string;
          };
          if (!prepRes.ok) {
            const issues = prep.probe?.issues ?? [];
            const msg =
              typeof prep.error === 'string'
                ? prep.error
                : (prep.error?.message ?? `HTTP ${prepRes.status}`);
            const detail = issues
              .map((i) => `  ✗ ${i.message ?? i.code}`)
              .join('\n');
            throw new Error(detail ? `${msg}\n${detail}` : msg);
          }
          if (!(prep.nonce && prep.txBytes)) {
            throw new Error('Failed to prepare the listing.');
          }
          const bytes = new Uint8Array(Buffer.from(prep.txBytes, 'base64'));
          const { signature } = await agent.keypair.signTransaction(bytes);
          const sub = await fetchJson(`${base}/agent/endpoint/submit`, {
            method: 'POST',
            body: { nonce: prep.nonce, address, signature },
          });

          if (isJsonMode()) {
            printJson({
              address,
              endpoint: opts.remove ? null : target,
              listed: !opts.remove,
              probe: prep.probe ?? null,
              digest: sub.digest,
            });
            return;
          }
          printBlank();
          if (opts.remove) {
            printSuccess('Listing removed.');
          } else {
            printSuccess('Listed — your endpoint is live on your public profile.');
            if (prep.probe?.amount) {
              printKeyValue('Price', `${prep.probe.amount} USDC per call`);
            }
            printKeyValue('Endpoint', target);
            printInfo(`Buyers pay it with: t2 pay ${target}`);
            printKeyValue('Profile', `https://agents.t2000.ai/${address}`);
          }
          printKeyValue('Tx', String(sub.digest));
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('list-catalog')
    .description(
      'List your x402 endpoint in the MPP catalog (mpp.t2000.ai) — permissionless, machine-gated. Reads your on-chain Agent ID listing (set with `t2 agent sell`), live-probes it, and verifies the 402 pays your wallet. Serve OpenAPI with x-payment-info at /openapi.json to list multiple endpoints.',
    )
    .option(
      '--remove',
      'Remove your catalog entry (clear your on-chain listing first: t2 agent sell --remove)',
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY_BASE})`)
    .action(async (opts: { remove?: boolean; key?: string; gateway?: string }) => {
      try {
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();
        const base = opts.gateway ?? DEFAULT_GATEWAY_BASE;

        const res = await fetch(`${base}/api/catalog/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });
        const out = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          gates?: { gate: string; ok: boolean; detail: string }[];
          serviceId?: string;
          url?: string;
          removed?: boolean;
          error?: string;
        };
        if (out.error && !out.gates) {
          throw new Error(out.error);
        }

        if (opts.remove && out.ok && !out.removed) {
          // The catalog follows the chain: entry can't be removed while the
          // on-chain listing is still set (the submit just revalidated it).
          throw new Error(
            'Your on-chain listing is still live, so the catalog entry stays. Run `t2 agent sell --remove` first, then re-run `t2 agent list-catalog`.',
          );
        }

        if (isJsonMode()) {
          printJson({
            address,
            ok: out.ok ?? false,
            gates: out.gates ?? [],
            serviceId: out.serviceId ?? null,
            url: out.url ?? null,
            removed: out.removed ?? false,
          });
          if (!out.ok) process.exitCode = 1;
          return;
        }

        printBlank();
        for (const gate of out.gates ?? []) {
          printInfo(`${gate.ok ? '✓' : '✗'} ${gate.gate}: ${gate.detail}`);
        }
        printBlank();
        if (out.removed) {
          printSuccess('Catalog entry removed.');
        } else if (out.ok) {
          printSuccess('Listed in the MPP catalog.');
          if (out.url) printKeyValue('Catalog', out.url);
          printInfo('Re-probed daily — keep the 402 answering or the entry suspends.');
        } else {
          throw new Error('Not listed — fix the failed gate(s) above and re-run.');
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
