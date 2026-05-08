import { describe, it, expect } from 'vitest';
import { parseTreasuryFees } from './eventParser.js';
import type { ParsedTransaction } from './checkpoint.js';

const TREASURY = '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a';
const SENDER = '0x' + 'a'.repeat(64);
const NAVI_PKG = '0x' + 'b'.repeat(64);
const CETUS_PKG = '0x' + 'c'.repeat(64);

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';

function makeTx(opts: {
  digest?: string;
  moveCallTargets: string[];
  inflowsToTreasury: Array<{ coinType: string; amount: string }>;
}): ParsedTransaction {
  return {
    digest: opts.digest ?? '0x' + 'd'.repeat(64),
    sender: SENDER,
    timestamp: Date.now(),
    events: [],
    moveCallTargets: opts.moveCallTargets,
    balanceChanges: opts.inflowsToTreasury.map(({ coinType, amount }) => ({
      owner: { AddressOwner: TREASURY },
      coinType,
      amount,
    })),
  };
}

describe('parseTreasuryFees — operation classification', () => {
  it('classifies a pure save tx as "save"', () => {
    const tx = makeTx({
      moveCallTargets: [`${NAVI_PKG}::incentive_v3::entry_deposit`],
      inflowsToTreasury: [{ coinType: USDC_TYPE, amount: '1000' }],
    });
    const fees = parseTreasuryFees(tx, TREASURY);
    expect(fees).toHaveLength(1);
    expect(fees[0].operation).toBe('save');
    expect(fees[0].feeRate).toBe('0.001');
  });

  it('classifies a pure swap tx as "swap"', () => {
    const tx = makeTx({
      moveCallTargets: [`${CETUS_PKG}::router::swap`],
      inflowsToTreasury: [{ coinType: SUI_TYPE, amount: '500000' }],
    });
    const fees = parseTreasuryFees(tx, TREASURY);
    expect(fees).toHaveLength(1);
    expect(fees[0].operation).toBe('swap');
    expect(fees[0].feeRate).toBe('0.001');
  });

  it('classifies a pure claim tx as "claim" (fee-free, present so not "unknown")', () => {
    const tx = makeTx({
      moveCallTargets: [`${NAVI_PKG}::incentive_v3::claim_reward`],
      inflowsToTreasury: [],
    });
    const fees = parseTreasuryFees(tx, TREASURY);
    expect(fees).toHaveLength(0);
  });

  /**
   * S.120 follow-up: a `harvest_rewards` PTB contains:
   *   - 1 NAVI claim target
   *   - N Cetus swap targets (one per non-USDC reward)
   *   - 1 NAVI deposit target
   * Pre-fix: classifier returned the FIRST matching target's action ('claim'
   * or 'swap' or 'save' depending on iterator order), and EVERY fee row
   * from the tx was tagged with that single action — masking harvest
   * revenue in `ProtocolFeeLedger`.
   */
  describe('harvest classification (S.120 follow-up)', () => {
    it('classifies claim + save as "harvest"', () => {
      const tx = makeTx({
        moveCallTargets: [
          `${NAVI_PKG}::incentive_v3::claim_reward`,
          `${NAVI_PKG}::incentive_v3::deposit_with_account_cap`,
        ],
        inflowsToTreasury: [{ coinType: USDC_TYPE, amount: '5000' }],
      });
      const fees = parseTreasuryFees(tx, TREASURY);
      expect(fees).toHaveLength(1);
      expect(fees[0].operation).toBe('harvest');
      expect(fees[0].feeRate).toBe('0.002');
    });

    it('classifies claim + swap + save as "harvest" (typical harvest with one non-USDC reward)', () => {
      const tx = makeTx({
        moveCallTargets: [
          `${NAVI_PKG}::incentive_v3::claim_reward_with_account_cap`,
          `${CETUS_PKG}::router::swap`,
          `${NAVI_PKG}::incentive_v3::deposit_with_account_cap`,
        ],
        inflowsToTreasury: [
          { coinType: SUI_TYPE, amount: '500000' },     // swap overlay leg
          { coinType: USDC_TYPE, amount: '5000' },       // save fee leg
        ],
      });
      const fees = parseTreasuryFees(tx, TREASURY);
      expect(fees).toHaveLength(2);
      expect(fees.every((f) => f.operation === 'harvest')).toBe(true);
      expect(fees.every((f) => f.feeRate === '0.002')).toBe(true);
      // Asset symbols preserved per balance change so stats can break down by coin.
      expect(fees.map((f) => f.feeAsset).sort()).toEqual(['SUI', 'USDC']);
    });

    it('classifies claim + multiple swaps + save as "harvest" (multi-reward harvest)', () => {
      const tx = makeTx({
        moveCallTargets: [
          `${NAVI_PKG}::incentive_v3::claim_reward_with_account_cap`,
          `${CETUS_PKG}::router::swap`,
          `${CETUS_PKG}::aggregator::swap`,
          `${NAVI_PKG}::incentive_v3::deposit_with_account_cap`,
        ],
        inflowsToTreasury: [
          { coinType: SUI_TYPE, amount: '500000' },
          { coinType: SUI_TYPE, amount: '300000' },
          { coinType: USDC_TYPE, amount: '5000' },
        ],
      });
      const fees = parseTreasuryFees(tx, TREASURY);
      expect(fees).toHaveLength(3);
      expect(fees.every((f) => f.operation === 'harvest')).toBe(true);
    });

    it('does NOT classify claim alone as harvest (must have deposit too)', () => {
      const tx = makeTx({
        moveCallTargets: [`${NAVI_PKG}::incentive_v3::claim_reward`],
        inflowsToTreasury: [{ coinType: USDC_TYPE, amount: '1000' }],
      });
      const fees = parseTreasuryFees(tx, TREASURY);
      expect(fees[0].operation).toBe('claim');
    });

    it('does NOT classify deposit alone as harvest (must have claim too)', () => {
      const tx = makeTx({
        moveCallTargets: [`${NAVI_PKG}::incentive_v3::deposit_with_account_cap`],
        inflowsToTreasury: [{ coinType: USDC_TYPE, amount: '1000' }],
      });
      const fees = parseTreasuryFees(tx, TREASURY);
      expect(fees[0].operation).toBe('save');
    });

    it('does NOT classify swap + save as harvest (no claim → not a harvest)', () => {
      const tx = makeTx({
        moveCallTargets: [
          `${CETUS_PKG}::router::swap`,
          `${NAVI_PKG}::incentive_v3::entry_deposit`,
        ],
        inflowsToTreasury: [
          { coinType: SUI_TYPE, amount: '500000' },
          { coinType: USDC_TYPE, amount: '5000' },
        ],
      });
      const fees = parseTreasuryFees(tx, TREASURY);
      // Falls back to first-match classifier — first matching target wins.
      // (Either 'swap' or 'save' is acceptable; the assertion is "not harvest".)
      expect(fees.every((f) => f.operation !== 'harvest')).toBe(true);
    });
  });

  describe('balance-change filtering', () => {
    it('ignores balance changes that do not flow to the treasury wallet', () => {
      const tx: ParsedTransaction = {
        ...makeTx({
          moveCallTargets: [`${NAVI_PKG}::incentive_v3::entry_deposit`],
          inflowsToTreasury: [],
        }),
        balanceChanges: [
          { owner: { AddressOwner: '0x' + 'e'.repeat(64) }, coinType: USDC_TYPE, amount: '1000' },
        ],
      };
      const fees = parseTreasuryFees(tx, TREASURY);
      expect(fees).toHaveLength(0);
    });

    it('ignores negative balance changes (outflows)', () => {
      const tx = makeTx({
        moveCallTargets: [`${NAVI_PKG}::incentive_v3::entry_deposit`],
        inflowsToTreasury: [{ coinType: USDC_TYPE, amount: '-1000' }],
      });
      const fees = parseTreasuryFees(tx, TREASURY);
      expect(fees).toHaveLength(0);
    });

    it('records non-USDC fee inflows with the correct asset symbol (e.g. SUI from a swap overlay)', () => {
      const tx = makeTx({
        moveCallTargets: [`${CETUS_PKG}::router::swap`],
        inflowsToTreasury: [{ coinType: SUI_TYPE, amount: '1000000' }],
      });
      const fees = parseTreasuryFees(tx, TREASURY);
      expect(fees).toHaveLength(1);
      expect(fees[0].feeAsset).toBe('SUI');
      expect(fees[0].operation).toBe('swap');
    });
  });
});
