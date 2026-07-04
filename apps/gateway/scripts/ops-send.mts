/**
 * One-shot gasless USDC send for treasury ops (S.627 balance splits/sweeps).
 * Signs with the Bech32 key in OPS_SEND_KEY (env) — never a file, never argv.
 *
 * Usage:
 *   OPS_SEND_KEY=suiprivkey1… npx tsx apps/gateway/scripts/ops-send.mts <to> <amountUsdc>
 *
 * Pure `0x2::balance::send_funds<USDC>` (the allowlisted gasless shape — no
 * SUI needed), same mechanics as the gateway's lib/refund.ts spender.
 */

import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress } from '@mysten/sui/utils';

const SUI_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const [to, amountStr] = process.argv.slice(2);
const secret = process.env.OPS_SEND_KEY;
if (!(secret && to && amountStr)) {
  console.error('Usage: OPS_SEND_KEY=suiprivkey1… ops-send.mts <to> <amountUsdc>');
  process.exit(1);
}
if (!isValidSuiAddress(to)) {
  console.error(`Invalid recipient: ${to}`);
  process.exit(1);
}
const atomic = Math.floor(Number(amountStr) * 1_000_000);
if (!Number.isFinite(atomic) || atomic < 10_000) {
  console.error(`Amount must be ≥ $0.01 (got "${amountStr}")`);
  process.exit(1);
}

const { secretKey } = decodeSuiPrivateKey(secret);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const sender = keypair.toSuiAddress();

const client = new SuiGrpcClient({
  baseUrl: 'https://fullnode.mainnet.sui.io:443',
  network: 'mainnet',
});

const tx = new Transaction();
tx.setSender(sender);
tx.moveCall({
  target: '0x2::balance::send_funds',
  typeArguments: [SUI_USDC_TYPE],
  arguments: [tx.balance({ type: SUI_USDC_TYPE, balance: BigInt(atomic) }), tx.pure.address(to)],
});

const bytes = await tx.build({ client });
const { signature } = await keypair.signTransaction(bytes);
const result = await client.core.executeTransaction({
  transaction: bytes,
  signatures: [signature],
  include: { effects: true },
});
const txn = result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
if (!txn?.digest) {
  console.error('No digest returned — send failed.');
  process.exit(1);
}
console.log(`sent $${(atomic / 1e6).toFixed(6)} ${sender.slice(0, 10)}… → ${to.slice(0, 10)}…`);
console.log(`https://suiscan.xyz/mainnet/tx/${txn.digest}`);
