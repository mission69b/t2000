import { Transaction } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SUPPORTED_ASSETS, type SupportedAsset } from '../constants.js';
import { T2000Error } from '../errors.js';
import { validateAddress } from '../utils/sui.js';
import { displayToRaw } from '../utils/format.js';

export interface SendParams {
  client: SuiClient;
  keypair: Ed25519Keypair;
  to: string;
  amount: number;
  asset?: SupportedAsset;
}

export interface SendTxResult {
  digest: string;
  gasCost: number;
}

export async function buildSendTx({
  client,
  address,
  to,
  amount,
  asset = 'USDC',
}: { client: SuiClient; address: string; to: string; amount: number; asset?: SupportedAsset }): Promise<Transaction> {
  const recipient = validateAddress(to);
  const assetInfo = SUPPORTED_ASSETS[asset];

  if (!assetInfo) throw new T2000Error('ASSET_NOT_SUPPORTED', `Asset ${asset} is not supported`);
  if (amount <= 0) throw new T2000Error('INVALID_AMOUNT', 'Amount must be greater than zero');

  const rawAmount = displayToRaw(amount, assetInfo.decimals);
  const tx = new Transaction();
  tx.setSender(address);

  if (asset === 'SUI') {
    const [coin] = tx.splitCoins(tx.gas, [rawAmount]);
    tx.transferObjects([coin], recipient);
  } else {
    const coins = await client.getCoins({ owner: address, coinType: assetInfo.type });
    if (coins.data.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', `No ${asset} coins found`);

    const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    if (totalBalance < rawAmount) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${asset} balance`, {
        available: Number(totalBalance) / 10 ** assetInfo.decimals, required: amount,
      });
    }

    const primaryCoin = tx.object(coins.data[0].coinObjectId);
    if (coins.data.length > 1) {
      tx.mergeCoins(primaryCoin, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    const [sendCoin] = tx.splitCoins(primaryCoin, [rawAmount]);
    tx.transferObjects([sendCoin], recipient);
  }

  return tx;
}

export async function buildAndExecuteSend({
  client,
  keypair,
  to,
  amount,
  asset = 'USDC',
}: SendParams): Promise<SendTxResult> {
  const recipient = validateAddress(to);
  const assetInfo = SUPPORTED_ASSETS[asset];

  if (!assetInfo) {
    throw new T2000Error('ASSET_NOT_SUPPORTED', `Asset ${asset} is not supported`);
  }
  if (amount <= 0) {
    throw new T2000Error('INVALID_AMOUNT', 'Amount must be greater than zero');
  }

  const senderAddress = keypair.getPublicKey().toSuiAddress();
  const rawAmount = displayToRaw(amount, assetInfo.decimals);

  const tx = new Transaction();

  if (asset === 'SUI') {
    const [coin] = tx.splitCoins(tx.gas, [rawAmount]);
    tx.transferObjects([coin], recipient);
  } else {
    const coins = await client.getCoins({
      owner: senderAddress,
      coinType: assetInfo.type,
    });

    if (coins.data.length === 0) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `No ${asset} coins found`);
    }

    const totalBalance = coins.data.reduce(
      (sum, c) => sum + BigInt(c.balance),
      0n,
    );

    if (totalBalance < rawAmount) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${asset} balance`, {
        available: Number(totalBalance) / 10 ** assetInfo.decimals,
        required: amount,
      });
    }

    const primaryCoin = tx.object(coins.data[0].coinObjectId);

    if (coins.data.length > 1) {
      tx.mergeCoins(
        primaryCoin,
        coins.data.slice(1).map((c) => tx.object(c.coinObjectId)),
      );
    }

    const [sendCoin] = tx.splitCoins(primaryCoin, [rawAmount]);
    tx.transferObjects([sendCoin], recipient);
  }

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  const gasUsed = result.effects?.gasUsed;
  const gasCost = gasUsed
    ? Math.abs(
        (Number(gasUsed.computationCost) +
          Number(gasUsed.storageCost) -
          Number(gasUsed.storageRebate)) /
        1e9
      )
    : 0;

  return {
    digest: result.digest,
    gasCost,
  };
}
