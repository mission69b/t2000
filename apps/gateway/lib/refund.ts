// [2.6 — no-charge-on-failure] Automated refund for the x402 dialect.
//
// The settle-first flow validates the payment on-chain (signature + balance)
// BEFORE the upstream runs, so an unsettleable/forged payment never costs an
// upstream call. But a payment that settled and THEN hit an upstream failure
// has charged the payer — this issues the gasless USDC refund back.
//
// The refund is a pure `0x2::balance::send_funds<USDC>(amount → payer)` from
// the treasury wallet — the allowlisted gasless shape, so the treasury needs
// no SUI. Signed with TREASURY_PRIVATE_KEY (must match TREASURY_ADDRESS),
// built + executed on the gRPC client (auto-detects gasless eligibility).
//
// When the key is absent the gateway logs `refund_due` and a human refunds
// (the pre-2.6 posture) — refunds degrade gracefully, never block the response.

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_USDC_TYPE } from './constants';
import { env } from './env';

const FULLNODE_URLS: Record<string, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
};

// undefined = not yet loaded; null = no/invalid key (refunds disabled)
let _treasury: Ed25519Keypair | null | undefined;

function getTreasury(): Ed25519Keypair | null {
  if (_treasury !== undefined) return _treasury;
  const secret = env.TREASURY_PRIVATE_KEY;
  if (!secret) {
    _treasury = null;
    return null;
  }
  try {
    const { secretKey } = decodeSuiPrivateKey(secret);
    _treasury = Ed25519Keypair.fromSecretKey(secretKey);
  } catch (err) {
    console.error(
      '[refund] TREASURY_PRIVATE_KEY is set but could not be decoded — auto-refund disabled:',
      err instanceof Error ? err.message : err,
    );
    _treasury = null;
  }
  return _treasury;
}

/** True when a valid treasury key is configured (auto-refund is active). */
export function refundsEnabled(): boolean {
  return getTreasury() !== null;
}

/** Test seam — reset the cached treasury keypair. */
export function __resetTreasury() {
  _treasury = undefined;
}

export interface RefundParams {
  /** The wallet that paid (and is being refunded). */
  payer: string;
  /** The settled amount as a decimal USD/USDC string (e.g. "0.02"). */
  amount: string;
  network: 'mainnet' | 'testnet';
}

/**
 * Issue a gasless USDC refund (treasury → payer). Returns the refund tx
 * digest. Throws when no key is configured or the tx fails — callers catch
 * and fall back to the manual `refund_due` log.
 */
export async function refundUsdc(params: RefundParams): Promise<string> {
  const treasury = getTreasury();
  if (!treasury) throw new Error('TREASURY_PRIVATE_KEY not configured');

  // Floor to USDC atomic units (6dp) — never refund more than was charged.
  const atomic = Math.floor(Number(params.amount) * 1_000_000);
  if (!Number.isFinite(atomic) || atomic <= 0) throw new Error(`Invalid refund amount: "${params.amount}"`);
  const amountRaw = BigInt(atomic);

  const client = new SuiGrpcClient({
    baseUrl: FULLNODE_URLS[params.network] ?? FULLNODE_URLS.mainnet,
    network: params.network,
  });

  const tx = new Transaction();
  tx.setSender(treasury.toSuiAddress());
  tx.moveCall({
    target: '0x2::balance::send_funds',
    typeArguments: [SUI_USDC_TYPE],
    arguments: [tx.balance({ type: SUI_USDC_TYPE, balance: amountRaw }), tx.pure.address(params.payer)],
  });

  // Build via gRPC so the gasless resolver zeros gas; sign with the treasury
  // key; execute via the transport-agnostic core API.
  const bytes = await tx.build({ client });
  const { signature } = await treasury.signTransaction(bytes);
  const result = await client.core.executeTransaction({
    transaction: bytes,
    signatures: [signature],
    include: { effects: true },
  });
  const txn = result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
  if (!txn?.digest) throw new Error('refund tx returned no digest');
  return txn.digest;
}
