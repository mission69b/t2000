/**
 * Shelf seed registrar (S.624) — ONE master mnemonic → every seed key.
 *
 * Founder backs up a single phrase (~/.t2000/seed-master.mnemonic); each seed
 * in seeds.json derives at m/44'/784'/<index>'/0'/0'. Registration shells out
 * to the t2 CLI (sponsored, gasless, idempotent).
 *
 *   npx tsx scripts/seed-agents.mts keys       # derive + write key files + addresses into seeds.json
 *   npx tsx scripts/seed-agents.mts register   # register + profile + service for every seed
 *   npx tsx scripts/seed-agents.mts buy        # live-buy each seed once (founder wallet pays)
 *   npx tsx scripts/seed-agents.mts exclusions # print the EXCLUDED_WALLETS block
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

type Seed = {
  index: number;
  slug: string;
  name: string;
  price: string;
  category: string;
  input: string | null;
  address: string;
  description: string;
};

// ⚠️ ARCHIVED (Phase 0, S.664 — SPEC_STORE_V2 §5-pre): the seed shelf was
// delisted + deactivated on-chain 2026-07-08. This manifest + script remain
// for reference until Store v2 Phase 2 replaces them with the Funkii AI
// catalog manifest (`t2 agent service sync`). Do NOT re-run `register`.
const MANIFEST = new URL('../seeds-archive.json', import.meta.url).pathname;
const MNEMONIC_PATH = join(homedir(), '.t2000', 'seed-master.mnemonic');
const GATEWAY_BASE = 'https://mpp.t2000.ai';

function loadManifest(): { seeds: Seed[]; raw: Record<string, unknown> } {
  const raw = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  return { seeds: raw.seeds as Seed[], raw };
}

function saveManifest(raw: Record<string, unknown>): void {
  writeFileSync(MANIFEST, `${JSON.stringify(raw, null, 2)}\n`);
}

function masterMnemonic(): string {
  if (existsSync(MNEMONIC_PATH)) {
    return readFileSync(MNEMONIC_PATH, 'utf8').trim();
  }
  const mnemonic = bip39.generateMnemonic(wordlist, 256);
  writeFileSync(MNEMONIC_PATH, `${mnemonic}\n`, { mode: 0o600 });
  console.log(`NEW master mnemonic written to ${MNEMONIC_PATH} — BACK THIS UP (it derives every seed key).`);
  return mnemonic;
}

function keypairFor(seed: Seed, mnemonic: string): Ed25519Keypair {
  return Ed25519Keypair.deriveKeypair(mnemonic, `m/44'/784'/${seed.index}'/0'/0'`);
}

function keyPath(seed: Seed): string {
  return join(homedir(), '.t2000', `seed-${seed.slug}.key`);
}

function t2(args: string[]): string {
  return execFileSync('t2', args, { encoding: 'utf8', timeout: 120_000 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The API rate-limits bursts — retry once after a cool-off. */
async function t2Paced(args: string[]): Promise<string> {
  try {
    return t2(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Too many requests') && !msg.toLowerCase().includes('rate')) {
      throw err;
    }
    await sleep(20_000);
    return t2(args);
  }
}

const mode = process.argv[2];
const { seeds, raw } = loadManifest();

if (mode === 'keys') {
  const mnemonic = masterMnemonic();
  for (const seed of seeds) {
    const kp = keypairFor(seed, mnemonic);
    const address = kp.getPublicKey().toSuiAddress();
    // t2 CLI wallet-file format: JSON envelope, not raw Bech32.
    writeFileSync(
      keyPath(seed),
      `${JSON.stringify({ version: 2, secret: kp.getSecretKey() })}\n`,
      { mode: 0o600 },
    );
    seed.address = address;
    console.log(`${seed.slug.padEnd(20)} ${address}`);
  }
  saveManifest(raw);
  console.log(`\n${seeds.length} keys written; addresses saved to seeds.json.`);
} else if (mode === 'register') {
  // Optionally start from a slug (resume after rate-limit): register <slug>
  const startAt = process.argv[3];
  let started = !startAt;
  for (const seed of seeds) {
    if (!started) {
      started = seed.slug === startAt;
      if (!started) {
        continue;
      }
    }
    const key = keyPath(seed);
    try {
      await t2Paced(['agent', 'register', '--key', key]);
      await sleep(2_000);
      await t2Paced([
        'agent', 'profile', '--key', key,
        '--name', seed.name,
        '--description', seed.description,
      ]);
      await sleep(2_000);
      await t2Paced([
        'agent', 'service', '--key', key,
        '--mcp-endpoint', `${GATEWAY_BASE}/sellers/${seed.slug}`,
        '--payment-methods', 'x402',
        '--price', seed.price,
        '--category', seed.category,
      ]);
      console.log(`OK   ${seed.slug} (${seed.address.slice(0, 10)}…) $${seed.price} ${seed.category}`);
      await sleep(3_000);
    } catch (err) {
      console.error(`FAIL ${seed.slug}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    }
  }
} else if (mode === 'buy') {
  const sample: Record<string, string> = {
    symbol: '{"symbol":"ETH"}',
    postUrl: '{"postUrl":"https://x.com/jack/status/20"}',
    about: '{"about":"I sell hourly weather forecasts for any city"}',
    content: '{"content":"BTC is in a mixed trend with stable volatility, 24% off its 90d high; 78% of the top 50 are up on the week - transition regime."}',
    address: '{"address":"0x7d7946813d086ff4e29283566cfacad5981465b68c115d975fbf5bae3e5cbc2f"}',
    holdings: '{"holdings":[{"symbol":"BTC","weightPct":50},{"symbol":"SUI","weightPct":30},{"symbol":"USDC","weightPct":20}]}',
  };
  for (const seed of seeds) {
    try {
      const args = ['agent', 'pay', seed.address];
      if (seed.input && sample[seed.input]) {
        args.push('--data', sample[seed.input]);
      }
      const out = t2(args);
      const paid = out.includes('✓ Paid');
      const read = out.match(/"read":\s*"([^"]+)/)?.[1]?.slice(0, 90);
      console.log(`${paid ? 'PAID' : '????'} ${seed.slug.padEnd(20)} ${read ?? '(no read line)'}`);
    } catch (err) {
      console.error(`FAIL ${seed.slug}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    }
  }
} else if (mode === 'exclusions') {
  for (const seed of seeds) {
    console.log(`    '${seed.address}', // ${seed.slug} (S.624)`);
  }
} else {
  console.log('usage: seed-agents.mts keys|register|buy|exclusions');
  process.exit(1);
}
