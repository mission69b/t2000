/**
 * x402 coin→address-balance migration — BUILD-TIME gasless probe.
 *
 * The launch-blocker (Recipes "insufficient SUI"): the x402 withdrawal form
 * draws ONLY from the SIP-58 address balance, so a wallet whose USDC is held
 * as `Coin<USDC>` objects (the normal post-transfer / post-swap shape) needs a
 * coin→address-balance migration first. The OLD migration merged + split coins
 * then `coin::send_funds` — but native `SplitCoins`/`MergeCoins` PTB commands
 * fall OUTSIDE Sui's gasless allowlist (every command must be a MoveCall into
 * the `0x2` `send_funds`/`redeem_funds`/`withdrawal_split`/`into_balance` set),
 * so the gRPC resolver left real gas on it → "insufficient SUI" for 0-SUI
 * coin-object holders. The fix migrates WHOLE coins via `coin::send_funds`
 * (one allowlisted MoveCall per coin, no split/merge) → gasless.
 *
 * This probe BUILDS each candidate shape through the gRPC client and inspects
 * the resolved `gasData`. It NEVER signs, submits, or moves any funds — it is a
 * read-only diagnostic. It proves, on a real wallet:
 *   - the gasless `balance::send_funds` send shape         → gas ZEROED (detector sanity)
 *   - the NEW whole-coin `coin::send_funds` migration       → gas ZEROED (the fix)
 *   - the OLD merge+split+`coin::send_funds` migration      → gas NOT zeroed (the bug)
 *
 * Run with (founder wallet, derived from the key — no signing happens here):
 *   SMOKE=1 E2E_TEST_PRIVATE_KEY=suiprivkey1... pnpm --filter @t2000/sdk test
 * Or a pure read-only address (no key at all):
 *   SMOKE=1 PROBE_ADDRESS=0x11ac... pnpm --filter @t2000/sdk test
 *
 * Requires the probe wallet to hold at least one `Coin<USDC>` object (otherwise
 * the migration shapes can't be exercised — the suite skips with a note).
 */
import { Transaction } from '@mysten/sui/transactions';
import { beforeAll, describe, expect, it } from 'vitest';
import { GASLESS_STABLE_TYPES } from '../constants.js';
import { USDC_TYPE } from '../token-registry.js';
import { getSuiGrpcClient } from '../utils/sui.js';
import {
  buildCoinToAddressBalanceMigration,
  selectAndSplitCoin,
} from '../wallet/coinSelection.js';

const SMOKE = !!process.env.SMOKE;
const PRIVATE_KEY = process.env.E2E_TEST_PRIVATE_KEY;
const PROBE_ADDRESS = process.env.PROBE_ADDRESS;

/** A gas shape is gasless iff price === 0 AND there are no gas payment coins. */
function isGasless(bytes: Uint8Array): { gasless: boolean; price: string; budget: string; payments: number } {
  const data = Transaction.from(bytes).getData();
  const gas = data.gasData;
  const price = String(gas.price ?? '');
  const budget = String(gas.budget ?? '');
  const payments = gas.payment?.length ?? 0;
  const gasless = BigInt(gas.price ?? 1) === 0n && payments === 0;
  return { gasless, price, budget, payments };
}

async function resolveOwner(): Promise<string | undefined> {
  if (PROBE_ADDRESS) return PROBE_ADDRESS;
  if (!PRIVATE_KEY) return undefined;
  // Derive the address from the key WITHOUT signing anything.
  const { keypairFromPrivateKey, getAddress } = await import('../wallet/keyManager.js');
  return getAddress(keypairFromPrivateKey(PRIVATE_KEY));
}

describe.skipIf(!SMOKE)('Smoke: x402 gasless build probe (no signing, no funds moved)', () => {
  const client = getSuiGrpcClient();
  let owner: string | undefined;
  const coins: { objectId: string; balance: bigint }[] = [];
  let coinSum = 0n;
  let total = 0n;

  beforeAll(async () => {
    owner = await resolveOwner();
    if (!owner) return;
    const balanceResp = await client.core.getBalance({ owner, coinType: USDC_TYPE });
    total = BigInt(balanceResp.balance.balance);
    let cursor: string | null | undefined;
    let hasNext = true;
    while (hasNext) {
      const page = await client.core.listCoins({ owner, coinType: USDC_TYPE, cursor: cursor ?? undefined });
      for (const c of page.objects) {
        coins.push({ objectId: c.objectId, balance: BigInt(c.balance) });
        coinSum += BigInt(c.balance);
      }
      cursor = page.cursor;
      hasNext = page.hasNextPage;
    }
    console.log(
      `[probe] owner=${owner} totalUSDC=${total} coinObjects=${coins.length} coinSum=${coinSum} addressBalance=${total - coinSum}`,
    );
  });

  it('REFERENCE: gasless balance::send_funds send → gas is zeroed (detector sanity)', async () => {
    if (!owner) return expect.unreachable('set E2E_TEST_PRIVATE_KEY or PROBE_ADDRESS');
    const tx = new Transaction();
    tx.setSender(owner);
    tx.moveCall({
      target: '0x2::balance::send_funds',
      typeArguments: [GASLESS_STABLE_TYPES.USDC],
      arguments: [tx.balance({ type: GASLESS_STABLE_TYPES.USDC, balance: 10_000n }), tx.pure.address(owner)],
    });
    const bytes = await tx.build({ client });
    const r = isGasless(bytes);
    console.log(`[probe] send balance::send_funds → ${JSON.stringify(r)}`);
    expect(r.gasless).toBe(true);
  });

  it('NEW FIX: whole-coin coin::send_funds migration → gas is zeroed', async () => {
    if (!owner) return expect.unreachable('set E2E_TEST_PRIVATE_KEY or PROBE_ADDRESS');
    if (coins.length === 0) {
      console.log('[probe] no Coin<USDC> objects — migration shape not exercisable on this wallet');
      return;
    }
    const { tx } = buildCoinToAddressBalanceMigration({
      coins,
      coinType: USDC_TYPE,
      owner,
      minAmount: 1n, // smallest shortfall → picks the single largest coin
    });
    tx.setSender(owner);
    const bytes = await tx.build({ client });
    const r = isGasless(bytes);
    console.log(`[probe] NEW whole-coin coin::send_funds → ${JSON.stringify(r)}`);
    expect(r.gasless).toBe(true);
  });

  it('OLD SHAPE: merge+split+coin::send_funds → gas NOT zeroed (reproduces the bug)', async () => {
    if (!owner) return expect.unreachable('set E2E_TEST_PRIVATE_KEY or PROBE_ADDRESS');
    if (coinSum < 1n) {
      console.log('[probe] no coin-object USDC — old shape not exercisable');
      return;
    }
    const shortfall = coinSum > 1n ? coinSum - 1n : coinSum; // force a split (not swapAll)
    let gaslessOld = false;
    let note = '';
    try {
      const tx = new Transaction();
      tx.setSender(owner);
      const { coin } = await selectAndSplitCoin(tx, client, owner, USDC_TYPE, shortfall, {
        sponsoredContext: true,
        allowSwapAll: false,
      });
      tx.moveCall({
        target: '0x2::coin::send_funds',
        typeArguments: [USDC_TYPE],
        arguments: [coin, tx.pure.address(owner)],
      });
      const bytes = await tx.build({ client });
      const r = isGasless(bytes);
      gaslessOld = r.gasless;
      note = JSON.stringify(r);
    } catch (e) {
      // A 0-SUI wallet can't even build the non-gasless shape (no gas coin) —
      // which is itself proof the old shape isn't gasless.
      note = `build threw (no gas coin) → not gasless: ${(e as Error).message}`;
    }
    console.log(`[probe] OLD merge+split+coin::send_funds → gasless=${gaslessOld} ${note}`);
    expect(gaslessOld).toBe(false);
  });
});
