// `t2 agent tokenize` — D-9 (SPEC_ACP_SUI §6a): launch this agent's one-time,
// agent-bound token from the CLI. Same rails as the console Token step:
// SDK `capital/launch` builders, USDC seed, symbol blocklist, one token per
// Agent ID (chain-enforced; pre-checked here so a taken slot fails BEFORE the
// publish spends gas). Two unsponsored transactions signed by this wallet:
//   1. publish — coin package (supply → this wallet, caps frozen, immutable)
//   2. tokenize — bind → 50/50 split → AGENT/USDC pool → 10y LpLock →
//      6mo treasury vest → finalize, atomically.
// A token is a utility, not an investment — fees fund the agent's work.

import { AGENT_ID_REGISTRY_ID } from '@t2000/id';
import {
  AGENT_CAPITAL_PACKAGE_ID,
  MIN_LP_USDC,
  buildPublishAgentCoinTx,
  buildTokenizeTx,
  getSuiClient,
} from '@t2000/sdk';
import type { Command } from 'commander';
import { withAgent } from '../../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printSuccess,
  printWarning,
} from '../../output.js';

const GRAPHQL_URL = 'https://graphql.mainnet.sui.io/graphql';

/** One-token-per-agent pre-check via the on-chain bind events — cheaper than
 *  discovering the abort after the publish already spent gas. */
async function isTokenized(agent: string): Promise<boolean> {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query B($t: String!) { events(first: 50, filter: { type: $t }) { nodes { contents { json } } } }`,
        variables: { t: `${AGENT_CAPITAL_PACKAGE_ID}::registry::AgentTokenBound` },
      }),
    });
    const json = (await res.json()) as {
      data?: { events?: { nodes?: { contents?: { json?: { agent?: string } } }[] } };
    };
    return (json.data?.events?.nodes ?? []).some(
      (n) => n.contents?.json?.agent === agent,
    );
  } catch {
    return false; // chain abort remains the backstop
  }
}

type SimOk = { gasSui: number };

async function simulate(
  client: ReturnType<typeof getSuiClient>,
  txBytes: Uint8Array,
): Promise<SimOk> {
  const sim = await client.core.simulateTransaction({
    transaction: txBytes,
    include: { effects: true },
  });
  const t = sim.$kind === 'Transaction' ? sim.Transaction : sim.FailedTransaction;
  const st = t?.status ?? t?.effects?.status;
  if (!st?.success) {
    throw new Error(`simulation failed: ${JSON.stringify(st).slice(0, 240)}`);
  }
  const g = t.effects.gasUsed;
  return {
    gasSui:
      Number(BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate)) /
      1e9,
  };
}

export function registerAgentTokenize(group: Command) {
  group
    .command('tokenize')
    .description(
      "Launch this agent's one-time token — 1B fixed supply, 50% LP (locked 10y, AGENT/USDC), 50% treasury (6mo vest), pool fees to the agent wallet only",
    )
    .requiredOption('--symbol <ticker>', 'Ticker, 2-8 chars A-Z0-9')
    .requiredOption('--name <name>', 'Token name (frozen on-chain forever)')
    .requiredOption('--usdc <amount>', `USDC to seed the pool (min ${Number(MIN_LP_USDC) / 1e6}, yours)`)
    .option('--description <text>', 'Token description (frozen)', '')
    .option('--icon <url>', 'https icon URL (frozen — use a URL you control)', 'https://t2000.ai/icon.png')
    .option('--dry-run', 'Validate + simulate the publish, execute nothing')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(
      async (opts: {
        symbol: string;
        name: string;
        usdc: string;
        description: string;
        icon: string;
        dryRun?: boolean;
        key?: string;
      }) => {
        try {
          const agent = await withAgent({ keyPath: opts.key });
          const address = agent.address();
          const client = getSuiClient();
          // Floor, never round up — seeded amount ≤ what was typed.
          const usdcFloat = Number.parseFloat(opts.usdc);
          const lpUsdcAmount = BigInt(Math.floor(usdcFloat * 1e6));

          if (await isTokenized(address)) {
            throw new Error(
              'this agent is already tokenized — one token per Agent ID, forever',
            );
          }

          // PTB 1 — validates symbol/name/icon (blocklist included) at build.
          const { tx: publishTx, moduleName, otw } = await buildPublishAgentCoinTx({
            coin: {
              symbol: opts.symbol,
              name: opts.name,
              description: opts.description,
              iconUrl: opts.icon,
              recipient: address,
            },
            launcher: address,
          });
          publishTx.setGasBudget(80_000_000n);
          const publishBytes = await publishTx.build({ client });
          const pubSim = await simulate(client, publishBytes);

          if (opts.dryRun) {
            if (isJsonMode()) {
              printJson({
                ok: true,
                dryRun: true,
                coinModule: `${moduleName}::${otw}`,
                publishGasSui: pubSim.gasSui,
                lpUsdc: Number(lpUsdcAmount) / 1e6,
              });
              return;
            }
            printBlank();
            printSuccess('Dry run OK — publish simulates clean. Nothing executed.');
            printKeyValue('Coin', `${moduleName}::${otw}`);
            printKeyValue('Publish gas (est.)', `${pubSim.gasSui} SUI`);
            printKeyValue('USDC seed', `${Number(lpUsdcAmount) / 1e6}`);
            printBlank();
            return;
          }

          printBlank();
          printInfo(`Publishing ${otw} (1B fixed, caps frozen, package immutable)…`);
          const sig1 = await agent.signer.signTransaction(publishBytes);
          const pub = await client.core.executeTransaction({
            transaction: publishBytes,
            signatures: [sig1.signature],
            include: { effects: true, objectTypes: true },
          });
          const pubTxn = pub.$kind === 'Transaction' ? pub.Transaction : pub.FailedTransaction;
          if (!pubTxn?.effects?.status?.success) {
            throw new Error('publish failed on-chain');
          }
          await client.core.waitForTransaction({ digest: pubTxn.digest }).catch(() => undefined);
          const types = pubTxn.objectTypes ?? {};
          const created = (pubTxn.effects.changedObjects ?? []).filter(
            (c) => c.idOperation === 'Created',
          );
          const supplyCoin = created.find((c) => (types[c.objectId] ?? '').includes('::coin::Coin<'));
          const coinType = supplyCoin
            ? (types[supplyCoin.objectId] ?? '').replace(/^.*Coin<(.+)>$/, '$1')
            : '';
          if (!(supplyCoin && coinType)) {
            throw new Error(`publish succeeded (${pubTxn.digest}) but the supply coin was not found`);
          }
          printSuccess(`Published — ${pubTxn.digest}`);

          printInfo('Tokenizing: bind → pool → 10y LP lock → 6mo vest → finalize…');
          let tokenizeBytes: Uint8Array | null = null;
          for (const usdcFirst of [false, true]) {
            const tx = await buildTokenizeTx({
              agent: address,
              launcher: address,
              coinType,
              supplyCoinId: supplyCoin.objectId,
              lpUsdcAmount,
              poolUrl: opts.icon,
              usdcFirst,
              agentRegistryId: AGENT_ID_REGISTRY_ID,
              client,
            });
            tx.setGasBudget(1_000_000_000n);
            try {
              const bytes = await tx.build({ client });
              await simulate(client, bytes);
              tokenizeBytes = bytes;
              break;
            } catch (e) {
              const msg = String(e instanceof Error ? e.message : e);
              // Cetus enforces a canonical pair order — flip and retry.
              if (!(msg.includes('new_pool_key') || msg.includes('pool_creator') || msg.includes('factory'))) {
                throw e;
              }
            }
          }
          if (!tokenizeBytes) {
            throw new Error('pool creation failed in both pair orientations');
          }
          const sig2 = await agent.signer.signTransaction(tokenizeBytes);
          const fin = await client.core.executeTransaction({
            transaction: tokenizeBytes,
            signatures: [sig2.signature],
            include: { effects: true, events: true },
          });
          const finTxn = fin.$kind === 'Transaction' ? fin.Transaction : fin.FailedTransaction;
          if (!finTxn?.effects?.status?.success) {
            throw new Error(`tokenize failed on-chain (${finTxn?.digest ?? 'no digest'})`);
          }
          let poolId: string | undefined;
          let lockId: string | undefined;
          for (const ev of finTxn.events ?? []) {
            if (ev.eventType?.endsWith('::registry::AgentTokenFinalized')) {
              const parsed = ev.json as { pool_id?: string; lock_id?: string } | undefined;
              poolId = parsed?.pool_id;
              lockId = parsed?.lock_id;
            }
          }

          if (isJsonMode()) {
            printJson({
              ok: true,
              coinType,
              publishDigest: pubTxn.digest,
              tokenizeDigest: finTxn.digest,
              poolId,
              lockId,
            });
            return;
          }
          printBlank();
          printSuccess('Token launched — LP locked 10 years, fees route to this agent only.');
          printKeyValue('Coin', coinType);
          printKeyValue('Pool', poolId ?? '—');
          printKeyValue('LP lock', lockId ?? '—');
          printKeyValue('Tokenize tx', finTxn.digest);
          printWarning('A token is a utility, not an investment — fees fund the agent.');
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );
}
