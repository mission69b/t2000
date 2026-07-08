/**
 * Phase 0 cleanup (SPEC_STORE_V2 §5-pre, S.664) — delist + deactivate the
 * t2000-operated seed shelf, ON-CHAIN.
 *
 * For every seed key file (~/.t2000/seed-*.key, all shelf generations):
 *   1. ONE sponsored tx: registry `update` (endpoint→null, methods→[]) +
 *      `set_active(false)`. Sender = the seed (its key signs), gas owner = the
 *      Agent ID sponsor (key read from audric web-v3 .env.local) — seeds hold
 *      0 SUI by design.
 *   2. DELETE its gateway deploy config (signed `t2000-deploy-remove:<ts>`).
 *
 * funkii-agnt-cli (#2) is NOT a seed file (it's ~/.t2000/wallet.key) and is
 * excluded by construction — it becomes Funkii AI in Phase 2.
 *
 *   npx tsx scripts/phase0-delist.mts            # dry-run (prints plan)
 *   npx tsx scripts/phase0-delist.mts execute    # runs against mainnet
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const AGENT_ID_PACKAGE_ID =
  '0x7669be207f9ac28a34d2cbd45dcfdade11e6fd503ad24e687c180931be9a45e9';
const AGENT_ID_REGISTRY_ID =
  '0xf41683aa9f4c121f34e4082c35180b0efdbd6d5293e3c88b1bcfa45ddf5c4119';
const CLOCK_ID = '0x6';
const GATEWAY_BASE = 'https://mpp.t2000.ai';
const SPONSOR_ENV_PATH =
  '/Users/funkii/dev/audric/apps/web-v3/.env.local';
const GAS_BUDGET = 20_000_000n; // 0.02 SUI headroom per tx (same as sponsored.ts)

// funkii-agnt-cli — defense in depth: never touch it even if a stray key file
// for it appears (it is Funkii AI's future identity, founder decision 2026-07-08).
const KEEP_ADDRESSES = new Set([
  '0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf',
]);

function keypairFromKeyFile(path: string): Ed25519Keypair {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { secret: string };
  const { scheme, secretKey } = decodeSuiPrivateKey(raw.secret);
  if (scheme !== 'ED25519') {
    throw new Error(`${path}: unsupported scheme ${scheme}`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function sponsorKeypair(): Ed25519Keypair {
  const env = readFileSync(SPONSOR_ENV_PATH, 'utf8');
  const line = env
    .split('\n')
    .find((l) => l.startsWith('AGENT_ID_PARENT_NFT_PRIVATE_KEY='));
  if (!line) {
    throw new Error('sponsor key not found in web-v3 .env.local');
  }
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
  const { scheme, secretKey } = decodeSuiPrivateKey(value);
  if (scheme !== 'ED25519') {
    throw new Error('sponsor key is not ED25519');
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}

// JSON-RPC record read (verify-grade) — for resume/skip idempotence.
const JSON_RPC = 'https://fullnode.mainnet.sui.io';
let agentsTableId: string | null = null;
async function jsonRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(JSON_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) {
    throw new Error(json.error.message);
  }
  return json.result;
}
async function readRecord(
  address: string,
): Promise<{ active: boolean; endpoint: string | null } | null> {
  try {
    if (!agentsTableId) {
      const obj = (await jsonRpc('sui_getObject', [
        AGENT_ID_REGISTRY_ID,
        { showContent: true },
      ])) as { data?: { content?: { fields?: { agents?: { fields?: { id?: { id?: string } } } } } } };
      agentsTableId = obj.data?.content?.fields?.agents?.fields?.id?.id ?? null;
      if (!agentsTableId) {
        return null;
      }
    }
    const res = (await jsonRpc('suix_getDynamicFieldObject', [
      agentsTableId,
      { type: 'address', value: address },
    ])) as { data?: { content?: { fields?: { value?: { fields?: Record<string, unknown> } } } } };
    const f = res.data?.content?.fields?.value?.fields;
    if (!f) {
      return null;
    }
    return {
      active: Boolean(f.active),
      endpoint: (f.mcp_endpoint ?? null) as string | null,
    };
  } catch {
    return null;
  }
}

function buildDelistTx(agent: string): Transaction {
  const tx = new Transaction();
  // Full-replace update: endpoint/methods/did/metadataUri all clear (seeds
  // carry no metadataUri — verified: registered address-only + service-set).
  tx.moveCall({
    target: `${AGENT_ID_PACKAGE_ID}::registry::update`,
    arguments: [
      tx.object(AGENT_ID_REGISTRY_ID),
      tx.pure.option('string', null),
      tx.pure.vector('string', []),
      tx.pure.option('string', null),
      tx.pure.option('string', null),
      tx.object(CLOCK_ID),
    ],
  });
  tx.moveCall({
    target: `${AGENT_ID_PACKAGE_ID}::registry::set_active`,
    arguments: [
      tx.object(AGENT_ID_REGISTRY_ID),
      tx.pure.address(agent),
      tx.pure.bool(false),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

async function main() {
  const execute = process.argv[2] === 'execute';
  const dir = join(homedir(), '.t2000');
  const keyFiles = readdirSync(dir)
    .filter((f) => f.startsWith('seed-') && f.endsWith('.key'))
    .sort();

  const client = new SuiGrpcClient({
    baseUrl: 'https://fullnode.mainnet.sui.io',
    network: 'mainnet',
  });
  const sponsor = sponsorKeypair();
  console.log(`sponsor: ${sponsor.toSuiAddress()}`);
  console.log(`${keyFiles.length} seed key files\n`);

  // DEDICATED gas coin (root-cause fix): the sponsor key also serves LIVE
  // production sponsored txs, so its default coins churn versions constantly —
  // any ref into that pool goes stale. Split a PRIVATE 0.5-SUI coin once at
  // start (nothing else will ever reference a new object), then version-chain
  // it through the run.
  let gasRef: { objectId: string; version: string | number; digest: string } | null =
    null;
  const refreshGas = async () => {
    if (!gasRef) {
      throw new Error('gasRef not initialized');
    }
    const obj = await client.core.getObject({ objectId: gasRef.objectId });
    const o =
      (obj as { object?: { objectId: string; version: string | number; digest: string } })
        .object ?? (obj as { objectId: string; version: string | number; digest: string });
    gasRef = { objectId: o.objectId, version: o.version, digest: o.digest };
  };
  const splitDedicatedGas = async () => {
    for (let i = 1; i <= 5; i++) {
      try {
        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [500_000_000n]); // 0.5 SUI
        tx.transferObjects([coin], sponsor.toSuiAddress());
        tx.setSender(sponsor.toSuiAddress());
        tx.setGasBudget(GAS_BUDGET);
        const bytes = await tx.build({ client });
        const { signature } = await sponsor.signTransaction(bytes);
        const result = await client.core.executeTransaction({
          transaction: bytes,
          signatures: [signature],
          include: { effects: true },
        });
        const txn =
          result.$kind === 'Transaction'
            ? result.Transaction
            : result.FailedTransaction;
        if (!txn.effects?.status?.success) {
          throw new Error('split reverted');
        }
        await client.core.waitForTransaction({ digest: txn.digest });
        const created = txn.effects?.changedObjects?.find(
          (c: { idOperation?: string }) => c.idOperation === 'Created',
        );
        const createdId =
          (created as { objectId?: string; id?: string } | undefined)?.objectId ??
          (created as { id?: string } | undefined)?.id;
        if (!createdId) {
          throw new Error(
            `no created coin in split effects: ${JSON.stringify(txn.effects?.changedObjects?.slice(0, 3))}`,
          );
        }
        gasRef = { objectId: createdId, version: 0, digest: '' };
        await refreshGas();
        console.log(`dedicated gas coin: ${createdId}\n`);
        return;
      } catch (e) {
        console.log(`split attempt ${i} failed: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 4000 * i));
      }
    }
    throw new Error('could not split a dedicated gas coin');
  };

  if (execute) {
    await splitDedicatedGas();
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const file of keyFiles) {
    const slug = file.replace(/^seed-/, '').replace(/\.key$/, '');
    let seed: Ed25519Keypair;
    try {
      seed = keypairFromKeyFile(join(dir, file));
    } catch (e) {
      console.log(`SKIP  ${slug} — unreadable key (${(e as Error).message})`);
      skipped++;
      continue;
    }
    const address = seed.toSuiAddress();
    if (KEEP_ADDRESSES.has(address)) {
      console.log(`KEEP  ${slug} (${address.slice(0, 10)}…) — Funkii AI`);
      skipped++;
      continue;
    }
    if (!execute) {
      console.log(`PLAN  ${slug.padEnd(22)} ${address}`);
      continue;
    }
    // Idempotence: skip seeds already delisted+inactive (resume-friendly).
    const state = await readRecord(address);
    if (state && !state.active && !state.endpoint) {
      console.log(`SKIP  ${slug.padEnd(22)} already delisted`);
      skipped++;
      continue;
    }

    try {
      // 1. On-chain: clear service fields + deactivate (one sponsored tx).
      // The sponsor's gas COIN is one owned object — build/execute strictly
      // sequentially, WAIT for finality before the next build, and retry the
      // stale-gas-version race (the equivocation class the rules warn about).
      let digest = '';
      let attempts = 0;
      for (;;) {
        attempts++;
        try {
          const tx = buildDelistTx(address);
          tx.setSender(address);
          tx.setGasOwner(sponsor.toSuiAddress());
          tx.setGasBudget(GAS_BUDGET);
          tx.setGasPayment([gasRef as { objectId: string; version: string | number; digest: string }]);
          const bytes = await tx.build({ client });
          const { signature: seedSig } = await seed.signTransaction(bytes);
          const { signature: sponsorSig } = await sponsor.signTransaction(bytes);
          const result = await client.core.executeTransaction({
            transaction: bytes,
            signatures: [seedSig, sponsorSig],
            include: { effects: true },
          });
          const txn =
            result.$kind === 'Transaction'
              ? result.Transaction
              : result.FailedTransaction;
          if (!txn.effects?.status?.success) {
            throw new Error(
              `tx reverted: ${JSON.stringify(txn.effects?.status?.error ?? 'unknown')}`,
            );
          }
          digest = txn.digest;
          await client.core.waitForTransaction({ digest });
          // Chain the gas coin's next version for the following seed.
          await refreshGas();
          break;
        } catch (e) {
          const msg = (e as Error).message;
          const staleGas =
            msg.includes('unavailable for consumption') ||
            msg.includes('needs to be rebuilt') ||
            msg.includes("version doesn't match");
          if (!staleGas || attempts >= 4) {
            throw e;
          }
          await new Promise((r) => setTimeout(r, 3000 * attempts));
          await refreshGas(); // re-read the dedicated coin's current version
        }
      }

      // 2. Gateway deploy config (no-op when none exists).
      const ts = Date.now();
      const msg = new TextEncoder().encode(`t2000-deploy-remove:${ts}`);
      const { signature: rmSig } = await seed.signPersonalMessage(msg);
      const res = await fetch(`${GATEWAY_BASE}/deploy/config`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, timestamp: ts, signature: rmSig }),
      });
      const deployNote = res.ok ? 'deploy-cleared' : `deploy-http-${res.status}`;

      console.log(`DONE  ${slug.padEnd(22)} ${digest} ${deployNote}`);
      ok++;
    } catch (e) {
      console.log(`FAIL  ${slug.padEnd(22)} ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(
    `\n${execute ? 'executed' : 'planned'}: ok=${ok} skipped=${skipped} failed=${failed}`,
  );
  if (execute && failed > 0) {
    process.exitCode = 1;
  }
}

void main();
