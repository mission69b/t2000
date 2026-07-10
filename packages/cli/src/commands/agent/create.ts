// `t2 agent create` — the composition umbrella (T1/A2, SPEC_COMPOSITION_MOMENT
// §4): ensure a wallet (generate if the path is empty, reuse if not) →
// register the Agent ID (idempotent, sponsored) → set the display profile
// (name · description · category) → optionally propose a Passport owner.
// One command from nothing to a named, listed agent. Unlike `t2 init`'s
// best-effort register, create is explicitly an online command — failures
// are loud.

import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import type { Command } from 'commander';
import {
  generateKeypair,
  hasLimits,
  saveKey,
  setLimits,
  walletExists,
} from '@t2000/sdk';
import { registerWallet, runSponsoredTx } from '../../lib/agent-register.js';
import { withAgent } from '../../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
} from '../../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';
const STORE_BASE = 'https://agents.t2000.ai';

// Mirrors the server-side allow-list — fails fast before signing.
const AGENT_CATEGORIES = [
  'ai-models',
  'data-feeds',
  'finance',
  'research',
  'dev-tools',
  'creative',
  'other',
] as const;

// Fresh wallets seed the same conservative defaults as `t2 init` (2.2 —
// limits ON by default).
const DEFAULT_PER_TX_USD = 25;
const DEFAULT_DAILY_USD = 100;

async function fetchJson(
  url: string,
  init?: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
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

export interface AgentCreateOptions {
  name: string;
  description?: string;
  category?: string;
  owner?: string;
  key?: string;
  api?: string;
}

export function registerAgentCreate(group: Command) {
  group
    .command('create')
    .description(
      'Create an agent in one pass — wallet + on-chain Agent ID + profile (+ optional owner link). Sponsored, gasless.',
    )
    .requiredOption('--name <name>', 'Display name (shown in the store)')
    .option('--description <text>', 'Short description (what it does, for whom)')
    .option(
      '--category <category>',
      `Directory category: ${AGENT_CATEGORIES.join(' | ')}`,
    )
    .option(
      '--owner <address>',
      'Propose a Passport owner (confirm at agents.t2000.ai → My agents)',
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (opts: AgentCreateOptions) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const name = opts.name.trim();
        if (!name) {
          throw new Error('--name must not be empty.');
        }
        if (name.length > 60) {
          throw new Error('--name must be 60 characters or fewer.');
        }

        let category: string | undefined;
        if (opts.category !== undefined) {
          const c = opts.category.trim().toLowerCase();
          if (!(AGENT_CATEGORIES as readonly string[]).includes(c)) {
            throw new Error(
              `--category must be one of: ${AGENT_CATEGORIES.join(', ')} (got "${opts.category}").`,
            );
          }
          category = c;
        }

        let owner: string | undefined;
        if (opts.owner !== undefined) {
          owner = normalizeSuiAddress(opts.owner.trim());
          if (!isValidSuiAddress(owner)) {
            throw new Error('--owner must be a valid Sui address.');
          }
        }

        // 1. Wallet — reuse the file if present (create "dresses" an existing
        // wallet; register is idempotent), otherwise generate + seed limits.
        const created = !(await walletExists(opts.key));
        if (created) {
          const keypair = generateKeypair();
          await saveKey(keypair, undefined, opts.key);
          if (!hasLimits()) {
            setLimits({
              perTxUsd: DEFAULT_PER_TX_USD,
              dailyUsd: DEFAULT_DAILY_USD,
            });
          }
        }
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();

        // 2. Register (sponsored; idempotent when already on-chain).
        const reg = await registerWallet({
          keypair: agent.keypair,
          address,
          base,
        });

        // 3. Profile — challenge + personal-message signature, no gas.
        const challenge = await fetchJson(`${base}/agent/challenge`, {
          method: 'POST',
          body: { address },
        });
        const nonce = challenge.nonce as string | undefined;
        if (!nonce) {
          throw new Error('Failed to get a challenge nonce.');
        }
        const message = new TextEncoder().encode(
          `t2000-agent-profile:${nonce}`,
        );
        const { signature } = await agent.keypair.signPersonalMessage(message);
        await fetchJson(`${base}/agent/profile`, {
          method: 'POST',
          body: {
            address,
            nonce,
            signature,
            displayName: name,
            description: opts.description,
            category,
          },
        });

        // 4. Optional owner link (agent-signed propose; the owner confirms in
        // the console or with `t2 agent confirm`).
        let ownerProposed = false;
        if (owner) {
          await runSponsoredTx({
            keypair: agent.keypair,
            actor: address,
            prepareUrl: `${base}/agent/owner/propose`,
            prepareBody: { address, owner },
            submitUrl: `${base}/agent/owner/submit`,
          });
          ownerProposed = true;
        }

        const storeUrl = `${STORE_BASE}/${address}`;
        if (isJsonMode()) {
          printJson({
            address,
            walletCreated: created,
            registered: true,
            alreadyRegistered: reg.alreadyRegistered,
            name,
            ...(category ? { category } : {}),
            ...(ownerProposed ? { ownerProposed: owner } : {}),
            storeUrl,
            keyPath: opts.key ?? '~/.t2000/wallet.key',
          });
          return;
        }

        printBlank();
        printSuccess(`${name} is live`);
        printKeyValue('Address', address);
        printKeyValue('Store', storeUrl);
        printKeyValue(
          'Wallet',
          created
            ? `created at ${opts.key ?? '~/.t2000/wallet.key'}`
            : `reused ${opts.key ?? '~/.t2000/wallet.key'}`,
        );
        if (ownerProposed) {
          printKeyValue(
            'Owner',
            `proposed ${owner} — confirm at ${STORE_BASE}/manage/agents`,
          );
        }
        printBlank();
        printLine('Next:');
        printLine('  t2 fund                      # add USDC (QR / card link)');
        printLine('  agents.t2000.ai/skills       # give it skills to act on Sui');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
