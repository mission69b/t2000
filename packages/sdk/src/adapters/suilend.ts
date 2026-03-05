import type { SuiClient } from '@mysten/sui/client';
import type {
  LendingAdapter,
  LendingRates,
  AdapterPositions,
  HealthInfo,
  AdapterTxResult,
  AdapterCapability,
} from './types.js';

/**
 * Suilend adapter stub — save + withdraw only for MVP.
 * Borrow/repay deferred to Phase 10 (multi-stable support).
 *
 * Implementation guide:
 * 1. Install: npm install @suilend/sdk
 * 2. Use NaviAdapter as the working reference
 * 3. Key Suilend patterns:
 *    - Obligation model: create obligation before first deposit
 *    - Transaction mutation: Suilend SDK mutates a passed-in Transaction
 *    - Amounts as raw strings: "1000000" = 1 USDC (6 decimals)
 *    - State refresh: call refreshAll() before operations
 *
 * @see https://docs.suilend.fi/ecosystem/suilend-sdk-guide
 * @see packages/sdk/src/adapters/navi.ts (reference implementation)
 */
export class SuilendAdapter implements LendingAdapter {
  readonly id = 'suilend';
  readonly name = 'Suilend';
  readonly version = '0.1.0';
  readonly capabilities: readonly AdapterCapability[] = ['save', 'withdraw'];
  readonly supportedAssets: readonly string[] = ['USDC'];
  readonly supportsSameAssetBorrow = false;

  // private client!: SuiClient;
  // private suilend!: SuilendClient;

  async init(_client: SuiClient): Promise<void> {
    // TODO: Initialize SuilendClient
    // import { SuilendClient, LENDING_MARKET_ID } from '@suilend/sdk';
    // this.client = client;
    // this.suilend = await SuilendClient.initialize(LENDING_MARKET_ID, client);
    throw new Error('SuilendAdapter.init() not implemented');
  }

  async getRates(_asset: string): Promise<LendingRates> {
    // TODO: Read reserve data from Suilend for the asset
    // Access this.suilend's lending market reserves to get supply/borrow APYs
    throw new Error('SuilendAdapter.getRates() not implemented');
  }

  async getPositions(_address: string): Promise<AdapterPositions> {
    // TODO: Fetch user's obligation
    // 1. SuilendClient.getObligationOwnerCaps(address, [LENDING_MARKET_ID], client)
    // 2. Read deposits/borrows from the obligation
    throw new Error('SuilendAdapter.getPositions() not implemented');
  }

  async getHealth(_address: string): Promise<HealthInfo> {
    // TODO: Read obligation health from Suilend
    throw new Error('SuilendAdapter.getHealth() not implemented');
  }

  async buildSaveTx(
    _address: string,
    _amount: number,
    _asset: string,
    _options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    // TODO: Build deposit PTB using Suilend SDK
    //
    // 1. const tx = new Transaction(); tx.setSender(address);
    // 2. Find existing obligation:
    //    const caps = await SuilendClient.getObligationOwnerCaps(address, [...], client);
    // 3. If no obligation, create one in the same PTB:
    //    const cap = this.suilend.createObligation(tx);
    // 4. Merge user's USDC coins
    // 5. If options.collectFee:
    //    import { addCollectFeeToTx } from '../protocols/protocolFee.js';
    //    addCollectFeeToTx(tx, mergedCoin, 'save');
    // 6. Deposit into obligation:
    //    await this.suilend.depositIntoObligation(address, coinType, rawAmount, tx, capId);
    // 7. return { tx };
    throw new Error('SuilendAdapter.buildSaveTx() not implemented');
  }

  async buildWithdrawTx(
    _address: string,
    _amount: number,
    _asset: string,
  ): Promise<AdapterTxResult & { effectiveAmount: number }> {
    // TODO: Build withdraw PTB
    //
    // 1. Find obligation and capId
    // 2. const withdrawnCoin = await this.suilend.withdraw(capId, obligationId, coinType, rawAmount, tx);
    // 3. tx.transferObjects([withdrawnCoin], address);
    // 4. return { tx, effectiveAmount: amount };
    throw new Error('SuilendAdapter.buildWithdrawTx() not implemented');
  }

  async buildBorrowTx(
    _address: string,
    _amount: number,
    _asset: string,
    _options?: { collectFee?: boolean },
  ): Promise<AdapterTxResult> {
    // Deferred to Phase 10 (multi-stable). Suilend does not support same-asset borrow.
    throw new Error('SuilendAdapter.buildBorrowTx() not available — Suilend requires different collateral/borrow assets. Deferred to Phase 10.');
  }

  async buildRepayTx(
    _address: string,
    _amount: number,
    _asset: string,
  ): Promise<AdapterTxResult> {
    // Deferred to Phase 10 (multi-stable).
    throw new Error('SuilendAdapter.buildRepayTx() not available — deferred to Phase 10.');
  }

  async maxWithdraw(_address: string, _asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }> {
    // TODO: Calculate max safe withdrawal based on obligation health
    throw new Error('SuilendAdapter.maxWithdraw() not implemented');
  }

  async maxBorrow(_address: string, _asset: string): Promise<{ maxAmount: number; healthFactorAfter: number; currentHF: number }> {
    // Deferred to Phase 10.
    throw new Error('SuilendAdapter.maxBorrow() not available — deferred to Phase 10.');
  }

  // --- Protocol-specific extensions (NOT part of LendingAdapter interface) ---

  // async claimRewards(address: string, rewards: Array<{
  //   reserveArrayIndex: bigint;
  //   rewardIndex: bigint;
  //   rewardCoinType: string;
  //   side: 'deposit' | 'borrow';
  // }>): Promise<AdapterTxResult> {
  //   TODO: Claim Suilend liquidity mining rewards
  //   const tx = new Transaction();
  //   const caps = await SuilendClient.getObligationOwnerCaps(address, [...], client);
  //   this.suilend.claimRewards(address, caps[0].id, rewards, tx);
  //   return { tx };
  // }
}
