/**
 * Phase 0 verifier — reads each seed's on-chain AgentRecord (registry Table
 * dynamic field) via JSON-RPC and reports delist state. No keys, no writes.
 *
 *   npx tsx scripts/phase0-verify.mts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const RPC = 'https://fullnode.mainnet.sui.io';
const REGISTRY_ID =
  '0xf41683aa9f4c121f34e4082c35180b0efdbd6d5293e3c88b1bcfa45ddf5c4119';
const KEEP = new Set([
  '0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf',
]);

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC, {
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

async function tableId(): Promise<string> {
  const obj = (await rpc('sui_getObject', [
    REGISTRY_ID,
    { showContent: true },
  ])) as { data?: { content?: { fields?: { agents?: { fields?: { id?: { id?: string } } } } } } };
  const id = obj.data?.content?.fields?.agents?.fields?.id?.id;
  if (!id) {
    throw new Error('could not resolve agents table id');
  }
  return id;
}

async function record(table: string, address: string) {
  try {
    const res = (await rpc('suix_getDynamicFieldObject', [
      table,
      { type: 'address', value: address },
    ])) as {
      data?: { content?: { fields?: { value?: { fields?: Record<string, unknown> } } } };
      error?: unknown;
    };
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

async function main() {
  const dir = join(homedir(), '.t2000');
  const keyFiles = readdirSync(dir)
    .filter((f) => f.startsWith('seed-') && f.endsWith('.key'))
    .sort();
  const table = await tableId();

  const remaining: string[] = [];
  let done = 0;
  for (const file of keyFiles) {
    const slug = file.replace(/^seed-/, '').replace(/\.key$/, '');
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { secret: string };
    const { secretKey } = decodeSuiPrivateKey(raw.secret);
    const address = Ed25519Keypair.fromSecretKey(secretKey).toSuiAddress();
    if (KEEP.has(address)) {
      console.log(`KEEP     ${slug}`);
      continue;
    }
    const rec = await record(table, address);
    if (!rec) {
      console.log(`ABSENT   ${slug} (never registered?)`);
      continue;
    }
    if (!rec.active && !rec.endpoint) {
      done++;
    } else {
      remaining.push(slug);
      console.log(`ACTIVE   ${slug.padEnd(22)} active=${rec.active} endpoint=${rec.endpoint ? 'set' : 'null'}`);
    }
  }
  console.log(`\ndelisted+inactive: ${done} · remaining: ${remaining.length}`);
  if (remaining.length) {
    console.log(`remaining: ${remaining.join(' ')}`);
  }
}

void main();
