// Stage 0 read-only parity + endpoint probe. Keyless, public mainnet, NO tx execution.
// Confirms: (1) public fullnode serves gRPC-web, (2) Core API shape parity, (3) latency.
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const URL = 'https://fullnode.mainnet.sui.io:443';
const ADDR = '0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012'; // gateway recipient, active mainnet
const USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const CLOCK = '0x6';

const json = new SuiJsonRpcClient({ url: URL, network: 'mainnet' });
const grpc = new SuiGrpcClient({ baseUrl: URL, network: 'mainnet' });

const t = async (label, fn) => {
  const s = performance.now();
  try {
    const r = await fn();
    const ms = (performance.now() - s).toFixed(0);
    console.log(`✅ ${label} (${ms}ms)`);
    return r;
  } catch (e) {
    const ms = (performance.now() - s).toFixed(0);
    console.log(`❌ ${label} (${ms}ms) → ${e?.message ?? e}`);
    return null;
  }
};

console.log('=== ENDPOINT: does public fullnode serve gRPC-web? ===');
const gBal = await t('gRPC  core.getBalance', () => grpc.core.getBalance({ owner: ADDR, coinType: USDC }));
if (gBal) console.log('   shape:', JSON.stringify(gBal));

const jBalLegacy = await t('JSON  getBalance (legacy)', () => json.getBalance({ owner: ADDR, coinType: USDC }));
if (jBalLegacy) console.log('   shape:', JSON.stringify(jBalLegacy));

const jBalCore = await t('JSON  core.getBalance', () => json.core.getBalance({ owner: ADDR, coinType: USDC }));
if (jBalCore) console.log('   shape:', JSON.stringify(jBalCore));

console.log('\n=== listOwnedObjects / listCoins ===');
const gObjs = await t('gRPC  core.listOwnedObjects', () => grpc.core.listOwnedObjects({ owner: ADDR }));
if (gObjs) console.log('   keys:', Object.keys(gObjs), 'count:', gObjs.objects?.length);

console.log('\n=== getObject (clock) — content shape ===');
const gClock = await t('gRPC  core.getObject 0x6', () => grpc.core.getObject({ objectId: CLOCK }));
if (gClock) console.log('   object keys:', Object.keys(gClock.object ?? {}));
const gClockJson = await t('gRPC  core.getObject 0x6 +json', () => grpc.core.getObject({ objectId: CLOCK, include: { json: true } }));
if (gClockJson) console.log('   json:', JSON.stringify(gClockJson.object?.json));

console.log('\n=== BENCHMARK: 5x getBalance fan-out (portfolio-like) ===');
const coins = [USDC, '0x2::sui::SUI', USDC, '0x2::sui::SUI', USDC];
const benchJson = async () => Promise.all(coins.map((c) => json.core.getBalance({ owner: ADDR, coinType: c })));
const benchGrpc = async () => Promise.all(coins.map((c) => grpc.core.getBalance({ owner: ADDR, coinType: c })));
await t('warm gRPC', benchGrpc);
await t('warm JSON', benchJson);
for (let i = 0; i < 3; i++) {
  await t(`  gRPC fan-out #${i + 1}`, benchGrpc);
  await t(`  JSON fan-out #${i + 1}`, benchJson);
}

// [gRPC migration Stage 1] The real flip gate: run the REWRITTEN `queryBalance`
// (now `client.core.*`) end-to-end on both transports and diff the full
// BalanceResponse. This is what the canary must see identical before flipping
// `T2000_TRANSPORT=grpc`. Imports from the built package, so run `pnpm build` first.
console.log('\n=== STAGE 1 GATE: queryBalance() parity across transports + wallet shapes ===');
const { queryBalance, resetSuiPriceCache, CETUS_USDC_SUI_POOL } = await import('./dist/index.js');

// (a) Direct Cetus-pool getObject json-shape parity. `fetchSuiPrice` reads
// `pool.object.json.current_sqrt_price`; if gRPC's json shape diverges, the
// price path silently falls back. Check the source read shape head-on, on BOTH
// transports, independent of any cache.
console.log('\n--- Cetus pool getObject json shape (price source) ---');
const jPool = await t('JSON  core.getObject pool +json', () => json.core.getObject({ objectId: CETUS_USDC_SUI_POOL, include: { json: true } }));
const gPool = await t('gRPC  core.getObject pool +json', () => grpc.core.getObject({ objectId: CETUS_USDC_SUI_POOL, include: { json: true } }));
const jSqrt = jPool?.object?.json?.current_sqrt_price;
const gSqrt = gPool?.object?.json?.current_sqrt_price;
console.log('   JSON current_sqrt_price:', jSqrt);
console.log('   gRPC current_sqrt_price:', gSqrt);
const poolShapeOk = jSqrt != null && gSqrt != null && String(jSqrt) === String(gSqrt);
console.log(poolShapeOk ? '✅ pool json shape parity' : '❌ pool json shape mismatch — price path would fall back on one transport');

// (b) queryBalance parity. Two fixes vs the earlier gate:
//   1. resetSuiPriceCache() before EVERY call so each transport actually hits
//      its own core.getObject (the module-level 60s price cache otherwise lets
//      the 2nd transport reuse the 1st's price and skip getObject entirely).
//   2. Do NOT strip usdEquiv/total. Compare them with a small relative tolerance
//      for genuine sub-second price ticks — a blown json shape falls back to
//      price=1.0 and shows up as a large gap, which this now catches.
const PRICE_TOL = 0.02; // 2% — absorbs a real Cetus tick between reads, not a fallback
const rel = (x, y) => (x === 0 && y === 0 ? 0 : Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y)));
function compare(a, b) {
  const structA = { ...a, gasReserve: { sui: a.gasReserve.sui }, total: undefined };
  const structB = { ...b, gasReserve: { sui: b.gasReserve.sui }, total: undefined };
  if (JSON.stringify(structA) !== JSON.stringify(structB)) return 'structural mismatch (stables / sui / available)';
  if (rel(a.gasReserve.usdEquiv, b.gasReserve.usdEquiv) > PRICE_TOL)
    return `usdEquiv drift ${a.gasReserve.usdEquiv} vs ${b.gasReserve.usdEquiv} (>${PRICE_TOL * 100}% — likely json-shape fallback on one transport)`;
  if (rel(a.total, b.total) > PRICE_TOL) return `total drift ${a.total} vs ${b.total}`;
  return null; // parity
}
// Reset, read — so this call computes price from its own transport's getObject.
const read = (client, addr) => {
  resetSuiPriceCache();
  return queryBalance(client, addr);
};

const WALLETS = [
  { label: 'gateway recipient (USDC + tiny SUI)', addr: ADDR },
  { label: 'overlay fee wallet', addr: '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a' },
  { label: 'likely-empty / zero path', addr: `0x${'0'.repeat(60)}dead` },
];

let allParity = poolShapeOk;
for (const w of WALLETS) {
  console.log(`\n--- ${w.label} ---`);
  // Both orders, to catch any order-dependent cache leak.
  const jA = await t('JSON  queryBalance (order A)', () => read(json, w.addr));
  const gA = await t('gRPC  queryBalance (order A)', () => read(grpc, w.addr));
  const gB = await t('gRPC  queryBalance (order B)', () => read(grpc, w.addr));
  const jB = await t('JSON  queryBalance (order B)', () => read(json, w.addr));
  if (!jA || !gA || !gB || !jB) {
    allParity = false;
    console.log('❌ a read failed — cannot assert parity');
    continue;
  }
  console.log('   JSON:', JSON.stringify(jA));
  console.log('   gRPC:', JSON.stringify(gA));
  const failA = compare(jA, gA); // JSON-first order
  const failB = compare(jB, gB); // gRPC-first order
  if (failA || failB) {
    allParity = false;
    console.log(`❌ PARITY MISMATCH — orderA: ${failA ?? 'ok'} | orderB: ${failB ?? 'ok'}`);
  } else {
    console.log('✅ PARITY (both orders; usdEquiv within tolerance, structure exact)');
  }
}

console.log(
  allParity
    ? '\n✅ STAGE 1 GATE PASS — pool shape + queryBalance parity hold across transports, wallet shapes, and call orders.'
    : '\n❌ STAGE 1 GATE FAIL — do not flip T2000_TRANSPORT until resolved.',
);
console.log('\ndone.');

// Make the gate machine-checkable: a CI step or canary guard can gate on the
// exit code. A logged ❌ with exit 0 reads as success to any automation.
if (!allParity) process.exitCode = 1;
