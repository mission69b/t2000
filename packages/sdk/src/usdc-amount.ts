// S.1226 (Aegis §3) — THE display-USDC → micro conversion. The bug class:
// `Math.floor(usdc * 1e6)` truncates float dust (0.29 * 1e6 =
// 289999.999… → 289999 micro — one micro short on every slot of a wave).
// Path here is integer-safe: render the number at exactly 6 decimals
// (every well-formed ≤6dp amount round-trips exactly) and parse it as a
// decimal STRING — no float multiply anywhere. Client-safe, zero deps.

const USDC_DECIMAL_RE = /^([0-9]+)(?:\.([0-9]{1,6}))?$/;

/** Decimal string ("0.10", "25") → micro units. Preferred at API
 *  boundaries — a string never carried float dust in the first place.
 *  Throws on junk or more than 6 decimals (USDC has 6). */
export function usdcStringToMicro(s: string): bigint {
  const m = USDC_DECIMAL_RE.exec(s.trim());
  if (!m) {
    throw new Error(
      `Not a USDC amount: "${s}" — digits with up to 6 decimals.`,
    );
  }
  const frac = (m[2] ?? '').padEnd(6, '0');
  return BigInt(m[1]) * 1_000_000n + BigInt(frac === '' ? '0' : frac);
}

/** Display USDC number → micro units, exactly. `0.29` → `290000n`, never
 *  `289999n`. Amounts are conceptually ≤6dp; sub-micro float residue is
 *  resolved by fixed-point rendering, not floor truncation. */
export function usdcToMicro(usdc: number): bigint {
  if (!Number.isFinite(usdc) || usdc < 0) {
    throw new Error(`Not a USDC amount: ${usdc}`);
  }
  return usdcStringToMicro(usdc.toFixed(6));
}
