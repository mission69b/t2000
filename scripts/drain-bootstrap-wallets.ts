/**
 * PR-B3 — Drain bootstrap + gas station wallets
 *
 * Sends every USDC + every SUI (minus a small gas reserve for the drain
 * tx itself) from the SPONSOR_PRIVATE_KEY and GAS_STATION_PRIVATE_KEY
 * wallets to a single destination.
 *
 * Run AFTER the 7-day soak window (i.e. after PR-B1 has been in prod for
 * >=7 days with no consumers calling the deleted /api/sponsor or /api/gas
 * endpoints).
 *
 * Usage:
 *   export SPONSOR_PRIVATE_KEY='suiprivkey1...' (from AWS Secrets Manager t2000/mainnet/sponsor-key)
 *   export GAS_STATION_PRIVATE_KEY='suiprivkey1...' (from AWS Secrets Manager t2000/mainnet/gas-station-key)
 *   export DRAIN_DEST='0x...' (destination address — the user's main treasury or a cold wallet)
 *   export DRAIN_DRY_RUN=1 (optional — preview balances without executing)
 *
 *   npx tsx scripts/drain-bootstrap-wallets.ts
 *
 * Safety
 * - Refuses to run if DRAIN_DEST is not a valid Sui address.
 * - Leaves 0.05 SUI in each wallet to cover the drain tx itself.
 * - Skips a wallet entirely if it's already empty.
 * - Prints a Suiscan link for every executed tx for audit.
 *
 * After this script
 * - Verify destination balance increased by the expected amount.
 * - Delete the AWS secrets (see audric-build-tracker.md for commands).
 * - Wallet addresses can be retired (no decommission needed — empty
 *   wallets cost nothing to leave on-chain).
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { isValidSuiAddress } from '@mysten/sui/utils';

const USDC_COIN_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const GAS_RESERVE_MIST = 50_000_000n; // 0.05 SUI — enough for one Sui tx with comfortable headroom.

function loadKeypair(envName: string): Ed25519Keypair {
  const sk = process.env[envName];
  if (!sk) throw new Error(`Missing ${envName} in env`);
  if (sk.startsWith('suiprivkey')) {
    // decodeSuiPrivateKey schema field is unreliable across SDK versions,
    // but a 32-byte secretKey is the canonical ED25519 size.
    const { secretKey } = decodeSuiPrivateKey(sk);
    if (secretKey.length !== 32) {
      throw new Error(`${envName}: expected 32-byte secret key, got ${secretKey.length}`);
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const bytes = Buffer.from(sk.replace(/^0x/, ''), 'hex');
  return Ed25519Keypair.fromSecretKey(bytes);
}

async function drainWallet(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  label: string,
  dest: string,
  dryRun: boolean,
): Promise<void> {
  const address = keypair.toSuiAddress();
  console.log(`\n=== ${label} (${address}) ===`);

  const [usdcBalance, suiBalance, usdcCoins] = await Promise.all([
    client.getBalance({ owner: address, coinType: USDC_COIN_TYPE }),
    client.getBalance({ owner: address }),
    client.getCoins({ owner: address, coinType: USDC_COIN_TYPE, limit: 100 }),
  ]);

  const usdcRaw = BigInt(usdcBalance.totalBalance);
  const suiRaw = BigInt(suiBalance.totalBalance);
  console.log(`  USDC: ${(Number(usdcRaw) / 1e6).toFixed(6)} (${usdcCoins.data.length} coins)`);
  console.log(`  SUI:  ${(Number(suiRaw) / 1e9).toFixed(6)}`);

  if (usdcRaw === 0n && suiRaw <= GAS_RESERVE_MIST) {
    console.log('  → already empty (or only dust SUI), skipping.');
    return;
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would transfer ${(Number(usdcRaw) / 1e6).toFixed(6)} USDC + ${(Number(suiRaw - GAS_RESERVE_MIST) / 1e9).toFixed(6)} SUI to ${dest}`);
    return;
  }

  const tx = new Transaction();

  if (usdcRaw > 0n && usdcCoins.data.length > 0) {
    const primary = usdcCoins.data[0];
    if (usdcCoins.data.length > 1) {
      tx.mergeCoins(
        tx.object(primary.coinObjectId),
        usdcCoins.data.slice(1).map((c) => tx.object(c.coinObjectId)),
      );
    }
    tx.transferObjects([tx.object(primary.coinObjectId)], dest);
  }

  if (suiRaw > GAS_RESERVE_MIST) {
    const sendAmount = suiRaw - GAS_RESERVE_MIST;
    const [split] = tx.splitCoins(tx.gas, [sendAmount]);
    tx.transferObjects([split], dest);
  }

  tx.setSender(address);
  const txBytes = await tx.build({ client });
  const { signature } = await keypair.signTransaction(txBytes);
  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature,
    options: { showEffects: true, showBalanceChanges: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  console.log(`  ✓ Tx: https://suiscan.xyz/mainnet/tx/${result.digest}`);
  if (result.effects?.status.status !== 'success') {
    throw new Error(`Tx failed: ${JSON.stringify(result.effects?.status)}`);
  }
}

async function main(): Promise<void> {
  const dest = process.env.DRAIN_DEST;
  if (!dest || !isValidSuiAddress(dest)) {
    throw new Error('DRAIN_DEST must be a valid Sui address (set via env)');
  }

  const dryRun = process.env.DRAIN_DRY_RUN === '1';

  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet') });

  console.log(`PR-B3 wallet drain${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Destination: ${dest}`);

  const sponsor = loadKeypair('SPONSOR_PRIVATE_KEY');
  const gasStation = loadKeypair('GAS_STATION_PRIVATE_KEY');

  await drainWallet(client, sponsor, 'sponsor wallet', dest, dryRun);
  await drainWallet(client, gasStation, 'gas station wallet', dest, dryRun);

  if (dryRun) {
    console.log('\n[DRY RUN] No transactions executed. Re-run without DRAIN_DRY_RUN=1 to drain.');
    return;
  }

  const destBalance = await client.getBalance({ owner: dest, coinType: USDC_COIN_TYPE });
  const destSui = await client.getBalance({ owner: dest });
  console.log(`\n✅ Drain complete. Destination ${dest}:`);
  console.log(`   USDC: ${(Number(destBalance.totalBalance) / 1e6).toFixed(6)}`);
  console.log(`   SUI:  ${(Number(destSui.totalBalance) / 1e9).toFixed(6)}`);
  console.log('\nNext: delete the AWS secrets (see audric-build-tracker.md).');
}

main().catch((err) => {
  console.error('\n❌', err);
  process.exit(1);
});
