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
import { formatUsd, type SupportedAsset, truncateAddress } from '@t2000/sdk';
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
            const amount = Number.parseFloat(opts.fund);
            if (Number.isNaN(amount) || amount <= 0) {
              throw new Error(`--fund must be a positive number (got "${opts.fund}").`);
            }
            const asset = normalizeTopupAsset(opts.asset);

            const cfg = await fetchJson(`${base}/agent/topup`, { method: 'GET' });
            const treasury = cfg.treasury as string | undefined;
            if (!treasury) {
              throw new Error('Could not resolve the t2000 treasury address.');
            }

            const sent = await agent.send({
              to: treasury,
              amount,
              asset: asset as SupportedAsset,
            });
            const topup = await fetchJson(`${base}/agent/topup`, {
              method: 'POST',
              body: { address, digest: sent.tx },
            });
            if (!isJsonMode()) {
              printSuccess(
                `Funded ${formatUsd(amount)} ${asset} → credit $${topup.balanceUsd}`,
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

          if (isJsonMode()) {
            printJson({ address, apiKey: key, baseUrl: base });
            return;
          }
          printBlank();
          printSuccess('Agent onboarded — API key minted (shown once, store it now)');
          printKeyValue('Address', truncateAddress(address));
          printKeyValue('API key', key);
          printKeyValue('Base URL', base);
          printBlank();
          printInfo(`export OPENAI_BASE_URL=${base}  OPENAI_API_KEY=${key}`);
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
