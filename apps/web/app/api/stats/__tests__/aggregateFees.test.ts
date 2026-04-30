import { describe, expect, it } from "vitest";
import { aggregateFees, type FeeRow } from "../aggregateFees";

const NOW = new Date("2026-04-30T00:00:00Z");
const ONE_DAY_AGO = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
const SEVEN_DAYS_AGO = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);

const SUI_PRICE = 4.0;

/**
 * H4 — regression test for the BigInt(decimalString) crash that 5xx'd
 * /api/stats on deploy. The Prisma `Decimal` column for legacy rows
 * stringifies as e.g. "1100.000000" — `BigInt("1100.000000")` throws
 * `SyntaxError: Cannot convert ... to a BigInt`. We must use `Number()`
 * for all fee-amount arithmetic.
 *
 * If this test ever fails, the fix went into the wrong place and the
 * /api/stats route is about to start 5xx'ing on prod data again.
 */
describe("aggregateFees — Decimal/BigInt safety", () => {
  it("does not throw when feeAmount is a Decimal-like string with a fractional part", () => {
    const rows: FeeRow[] = [
      { feeAmount: "1100.000000", feeAsset: "USDC", operation: "swap", createdAt: NOW },
      { feeAmount: "0.000000", feeAsset: "USDC", operation: "save", createdAt: NOW },
    ];

    expect(() => aggregateFees(rows, SUI_PRICE, ONE_DAY_AGO, SEVEN_DAYS_AGO)).not.toThrow();
  });

  it("aggregates a mix of Decimal strings, BigInt strings, and plain numbers", () => {
    const rows: FeeRow[] = [
      { feeAmount: "1100.000000", feeAsset: "USDC", operation: "swap", createdAt: NOW },
      { feeAmount: "2200", feeAsset: "USDC", operation: "swap", createdAt: NOW },
      { feeAmount: 3300, feeAsset: "USDC", operation: "save", createdAt: NOW },
    ];

    const result = aggregateFees(rows, SUI_PRICE, ONE_DAY_AGO, SEVEN_DAYS_AGO);

    expect(result.totalRecords).toBe(3);
    expect(result.totalUsdcCollected).toBeCloseTo(0.0066, 4);
    expect(result.byOperation.swap.count).toBe(2);
    expect(result.byOperation.swap.totalUsdc).toBeCloseTo(0.0033, 4);
    expect(result.byOperation.save.count).toBe(1);
    expect(result.byOperation.save.totalUsdc).toBeCloseTo(0.0033, 4);
  });
});

/**
 * H7 — byOperation.totalUsdEquivalent must surface non-USDC fees (Cetus
 * swap output asset is often SUI, not USDC). Before H7, swap fees in SUI
 * showed up in `byAsset.SUI` but `byOperation.swap.totalUsdc=0`, hiding
 * real revenue from operators.
 */
describe("aggregateFees — multi-asset USD equivalent", () => {
  it("converts SUI fees to USD using the live SUI price", () => {
    const rows: FeeRow[] = [
      { feeAmount: "1100000000", feeAsset: "SUI", operation: "swap", createdAt: NOW },
    ];

    const result = aggregateFees(rows, SUI_PRICE, ONE_DAY_AGO, SEVEN_DAYS_AGO);

    expect(result.byOperation.swap.totalUsdc).toBe(0);
    expect(result.byOperation.swap.totalUsdEquivalent).toBeCloseTo(1.1 * SUI_PRICE, 4);
    expect(result.totalUsdEquivalent).toBeCloseTo(1.1 * SUI_PRICE, 4);
  });

  it("treats stables (USDC, USDsui, USDT, USDe) as $1", () => {
    const rows: FeeRow[] = [
      { feeAmount: "1000000", feeAsset: "USDC", operation: "swap", createdAt: NOW },
      { feeAmount: "1000000", feeAsset: "USDsui", operation: "swap", createdAt: NOW },
      { feeAmount: "1000000", feeAsset: "USDT", operation: "swap", createdAt: NOW },
      { feeAmount: "1000000", feeAsset: "USDe", operation: "swap", createdAt: NOW },
    ];

    const result = aggregateFees(rows, SUI_PRICE, ONE_DAY_AGO, SEVEN_DAYS_AGO);

    expect(result.byOperation.swap.totalUsdEquivalent).toBeCloseTo(4, 4);
  });

  it("skips unknown assets in totalUsdEquivalent but still counts them", () => {
    const rows: FeeRow[] = [
      { feeAmount: "1000000", feeAsset: "USDC", operation: "swap", createdAt: NOW },
      { feeAmount: "5000000000", feeAsset: "MYSTERY", operation: "swap", createdAt: NOW },
    ];

    const result = aggregateFees(rows, SUI_PRICE, ONE_DAY_AGO, SEVEN_DAYS_AGO);

    expect(result.byOperation.swap.count).toBe(2);
    expect(result.byOperation.swap.totalUsdEquivalent).toBeCloseTo(1, 4);
    expect(result.byAsset.MYSTERY?.count).toBe(1);
    expect(result.byAsset.MYSTERY?.rawAmount).toBe("5000000000");
  });
});
