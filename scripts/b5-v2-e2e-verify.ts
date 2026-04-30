/**
 * E2E verification of the B5 v2 fee architecture (sdk@1.1.0, 2026-04-30).
 *
 * Snapshots the treasury wallet (RPC) + ProtocolFeeLedger (stats API),
 * prompts the user to perform one Audric write, then polls for the
 * on-chain inflow + indexer row + stats-API surfacing that prove every
 * layer of the new pipeline is wired correctly.
 *
 * Covers all 4 substantive code changes:
 *   1. SDK addFeeTransfer  — verified by treasury-wallet inflow
 *   2. Cetus overlayFee receiver = wallet (not Move object) — verified by
 *      output-asset (e.g. SUI) inflow on a swap
 *   3. Audric prepare/route adds fee inline — verified by ANY inflow on
 *      save / borrow / swap (was $0 pre-B5 v2)
 *   4. Indexer detects multi-asset inflows + writes ledger row — verified
 *      by /api/stats fees.totalRecords increment + byAsset breakdown
 *
 * Run:   npx tsx scripts/b5-v2-e2e-verify.ts
 *        npx tsx scripts/b5-v2-e2e-verify.ts --action=save     (instead of swap)
 *        npx tsx scripts/b5-v2-e2e-verify.ts --action=borrow
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const TREASURY_WALLET = '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a';
const STATS_URL = 'https://t2000.ai/api/stats';
const HEALTH_URL = 'https://api.t2000.ai/api/health';
const POLL_INTERVAL_MS = 10_000;
const TIMEOUT_MS = 5 * 60 * 1000;

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';

type WalletSnapshot = { coins: Record<string, bigint> };
type StatsSnapshot = {
  totalRecords: number;
  byAsset: Record<string, { count: number; rawAmount: string }>;
  byOperation: Record<string, { count: number; totalUsdc: number }>;
};

const action = process.argv.find((a) => a.startsWith('--action='))?.split('=')[1] ?? 'swap';

const HINTS: Record<string, { prompt: string; expectInflowAsset: string; minRawInflow: bigint }> = {
  swap: {
    prompt: '"swap 1 USDC to SUI" (the fee comes back as SUI — Cetus overlay is in the OUTPUT asset)',
    expectInflowAsset: 'SUI',
    minRawInflow: 1n, // any positive SUI inflow is a pass
  },
  save: {
    prompt: '"save 1 USDC" (the fee comes back as USDC via addFeeTransfer)',
    expectInflowAsset: 'USDC',
    minRawInflow: 1n,
  },
  borrow: {
    prompt: '"borrow 1 USDC against my savings" (the fee comes back as USDC via addFeeTransfer)',
    expectInflowAsset: 'USDC',
    minRawInflow: 1n,
  },
};

if (!HINTS[action]) {
  console.error(`Unknown --action='${action}'. Allowed: swap | save | borrow`);
  process.exit(2);
}

async function snapWallet(client: SuiJsonRpcClient): Promise<WalletSnapshot> {
  const balances = await client.getAllBalances({ owner: TREASURY_WALLET });
  const coins: Record<string, bigint> = {};
  for (const b of balances) coins[b.coinType] = BigInt(b.totalBalance);
  return { coins };
}

async function snapStats(): Promise<StatsSnapshot> {
  // Cache-bust because Vercel may serve a stale ISR copy.
  const r = await fetch(`${STATS_URL}?_=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`/api/stats ${r.status}`);
  const d: any = await r.json();
  return {
    totalRecords: d.fees.totalRecords,
    byAsset: d.fees.byAsset ?? {},
    byOperation: d.fees.byOperation ?? {},
  };
}

async function indexerLag(): Promise<number> {
  try {
    const r = await fetch(HEALTH_URL, { cache: 'no-store' });
    const d: any = await r.json();
    return d.indexer?.lag ?? -1;
  } catch {
    return -1;
  }
}

function diffCoins(after: WalletSnapshot, before: WalletSnapshot) {
  const out: Record<string, bigint> = {};
  const keys = new Set([...Object.keys(after.coins), ...Object.keys(before.coins)]);
  for (const k of keys) {
    const d = (after.coins[k] ?? 0n) - (before.coins[k] ?? 0n);
    if (d !== 0n) out[k] = d;
  }
  return out;
}

function shortAsset(coinType: string): string {
  if (coinType === SUI_TYPE) return 'SUI';
  if (coinType === USDC_TYPE) return 'USDC';
  return coinType.split('::').pop() ?? coinType.slice(-8);
}

function formatRawDelta(n: bigint, denom: number): string {
  const v = Number(n) / denom;
  if (v === 0) return '0';
  return v > 0 ? `+${v.toFixed(8)}` : v.toFixed(8);
}

function denomFor(asset: string): number {
  if (asset === 'SUI') return 1e9;
  if (asset === 'USDC' || asset === 'USDsui' || asset === 'USDT') return 1e6;
  return 1;
}

async function main() {
  const rl = readline.createInterface({ input, output });
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl('mainnet'),
    network: 'mainnet',
  });

  const hint = HINTS[action];

  console.log('\n=== B5 v2 e2e verify ===\n');
  console.log(`  action  : ${action}`);
  console.log(`  treasury: ${TREASURY_WALLET}`);
  console.log(`  stats   : ${STATS_URL}`);
  console.log('');

  console.log('Snapshotting BEFORE state…');
  const beforeWallet = await snapWallet(client);
  const beforeStats = await snapStats();
  const beforeLag = await indexerLag();
  console.log(`  treasury USDC : ${(Number(beforeWallet.coins[USDC_TYPE] ?? 0n) / 1e6).toFixed(6)}`);
  console.log(`  treasury SUI  : ${(Number(beforeWallet.coins[SUI_TYPE] ?? 0n) / 1e9).toFixed(9)}`);
  console.log(`  ledger rows   : ${beforeStats.totalRecords}`);
  console.log(`  byAsset       : ${JSON.stringify(beforeStats.byAsset)}`);
  console.log(`  indexer lag   : ${beforeLag} checkpoints`);
  console.log('');

  console.log('▶ ACTION REQUIRED');
  console.log('  1. Open https://audric.ai/new');
  console.log('  2. Sign in (zkLogin via Google)');
  console.log(`  3. Type into the chat: ${hint.prompt}`);
  console.log('  4. Approve the action in the confirm card');
  console.log('');
  await rl.question('Press ENTER once the action is confirmed (or Ctrl+C to abort)…');
  rl.close();

  console.log('\nPolling every 10s for treasury inflow + ledger row (timeout 5 min)…\n');

  const start = Date.now();
  let detected = false;
  let afterWallet = beforeWallet;
  let afterStats = beforeStats;

  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    afterWallet = await snapWallet(client);
    afterStats = await snapStats();
    const walletDiff = diffCoins(afterWallet, beforeWallet);
    const ledgerDelta = afterStats.totalRecords - beforeStats.totalRecords;
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const flags = `wallet=${Object.keys(walletDiff).length ? 'Δ' + Object.keys(walletDiff).map(shortAsset).join(',') : '·'} ledger=${ledgerDelta > 0 ? '+' + ledgerDelta : '·'}`;
    process.stdout.write(`  t+${elapsed.toString().padStart(3)}s ${flags}\n`);
    if (Object.keys(walletDiff).length > 0 && ledgerDelta > 0) {
      detected = true;
      break;
    }
  }

  console.log('\n=== AFTER state ===');
  console.log(`  treasury USDC : ${(Number(afterWallet.coins[USDC_TYPE] ?? 0n) / 1e6).toFixed(6)} (Δ ${formatRawDelta((afterWallet.coins[USDC_TYPE] ?? 0n) - (beforeWallet.coins[USDC_TYPE] ?? 0n), 1e6)})`);
  console.log(`  treasury SUI  : ${(Number(afterWallet.coins[SUI_TYPE] ?? 0n) / 1e9).toFixed(9)} (Δ ${formatRawDelta((afterWallet.coins[SUI_TYPE] ?? 0n) - (beforeWallet.coins[SUI_TYPE] ?? 0n), 1e9)})`);
  console.log(`  ledger rows   : ${afterStats.totalRecords} (+${afterStats.totalRecords - beforeStats.totalRecords})`);
  console.log('');

  const inflows = diffCoins(afterWallet, beforeWallet);
  console.log('Wallet inflows by asset:');
  for (const [coinType, delta] of Object.entries(inflows)) {
    if (delta > 0n) {
      const asset = shortAsset(coinType);
      console.log(`  ${asset.padEnd(8)} ${formatRawDelta(delta, denomFor(asset))} (raw ${delta})`);
    }
  }
  console.log('');

  console.log('Stats API byAsset:');
  for (const [asset, v] of Object.entries(afterStats.byAsset)) {
    const beforeCount = beforeStats.byAsset[asset]?.count ?? 0;
    const newCount = v.count - beforeCount;
    const marker = newCount > 0 ? '◀ NEW' : '';
    console.log(`  ${asset.padEnd(8)} ${v.count.toString().padStart(4)} rows  ${newCount > 0 ? '(+' + newCount + ')' : '   '}  ${marker}`);
  }
  console.log('');

  if (!detected) {
    console.log('⚠️  Timed out — wallet inflow OR ledger row not detected within 5 min.');
    console.log('    Possible causes:');
    console.log('      • Action not confirmed — re-check audric.ai for an error message');
    console.log(`      • Indexer lag — current: ${await indexerLag()} checkpoints`);
    console.log('      • Vercel ISR cache — already cache-busting via _=ts query');
    console.log('      • Cetus overlay misconfigured (swap fee silently dropped — REGRESSION)');
    process.exit(1);
  }

  const inflowAssets = Object.keys(inflows).filter((k) => (inflows[k] ?? 0n) > 0n).map(shortAsset);
  const ledgerNewAssets = Object.entries(afterStats.byAsset)
    .filter(([asset, v]) => v.count > (beforeStats.byAsset[asset]?.count ?? 0))
    .map(([asset]) => asset);

  const checks = [
    {
      name: '1. SDK addFeeTransfer / Cetus overlay routes inflow to wallet',
      pass: Object.keys(inflows).length > 0,
      detail: `inflows: ${inflowAssets.join(', ') || 'none'}`,
    },
    {
      name: '2. Inflow asset matches expected for this action',
      pass: inflowAssets.includes(hint.expectInflowAsset),
      detail: `expected ${hint.expectInflowAsset}, got [${inflowAssets.join(', ')}]`,
    },
    {
      name: '3. Indexer wrote ProtocolFeeLedger row(s)',
      pass: afterStats.totalRecords > beforeStats.totalRecords,
      detail: `+${afterStats.totalRecords - beforeStats.totalRecords} row(s)`,
    },
    {
      name: '4. Stats API surfaces the new row in byAsset',
      pass: ledgerNewAssets.length > 0,
      detail: `new asset(s): [${ledgerNewAssets.join(', ')}]`,
    },
    {
      name: '5. New asset matches inflow asset (multi-asset indexer fix from S.44)',
      pass: ledgerNewAssets.some((a) => inflowAssets.includes(a)),
      detail: `inflow=[${inflowAssets.join(',')}] ledger=[${ledgerNewAssets.join(',')}]`,
    },
  ];

  console.log('=== RESULTS ===');
  let allPass = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}`);
    console.log(`       ${c.detail}`);
    if (!c.pass) allPass = false;
  }
  console.log('');

  if (allPass) {
    console.log(`✓ B5 v2 ${action} pipeline verified end-to-end.`);
    console.log(`  Run with --action=save and --action=borrow to cover the other write paths.`);
  } else {
    console.log(`✗ One or more checks failed — see details above.`);
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error('\nUnhandled error:', e);
  process.exit(1);
});
