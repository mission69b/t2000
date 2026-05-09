/**
 * [SPEC 20.2 / D-1 (a)] Match a `swap_execute` pending write against the
 * same-turn `swap_quote` reads to thread the captured Cetus route into
 * the emitted `pending_action.cetusRoute`.
 *
 * The match key is `(from, to, amount, byAmountIn)` — the four fields that
 * deterministically identify a Cetus route. `slippage` is NOT part of the
 * key because slippage is a tx-build-time parameter, not a route-discovery
 * parameter (Cetus's `findSwapRoute` does not take slippage).
 *
 * No match → return undefined → caller emits the pending_action without
 * `cetusRoute`, audric prepare-route falls back to fresh `findSwapRoute()`
 * (D-5 dual-path). This is the legacy path; correct behavior, just slower.
 */
import type { SerializedCetusRoute } from '@t2000/sdk';

interface SwapQuoteInput {
  from: string;
  to: string;
  amount: number;
  byAmountIn?: boolean;
}

interface SwapExecuteInput {
  from: string;
  to: string;
  amount: number;
  byAmountIn?: boolean;
}

interface SwapQuoteResultLike {
  serializedRoute?: SerializedCetusRoute;
  // Other fields exist (fromToken, toToken, etc.) but we don't need them for matching.
}

/**
 * Per-turn read-result entry for swap_quote matching. The engine collects
 * these alongside the existing `turnReadToolResults` metadata array;
 * `data` + `input` are populated only for successful `swap_quote` results.
 */
export interface SwapQuoteReadEntry {
  toolUseId: string;
  input: SwapQuoteInput;
  result: SwapQuoteResultLike;
  timestamp: number;
}

/**
 * Return the most recent matching `swap_quote`'s serialized route, or
 * undefined if no same-turn quote matches the swap_execute's input.
 *
 * "Most recent" matters when the LLM calls `swap_quote` multiple times in
 * the same turn (e.g. exploring different amounts) — the most recent
 * matching quote is the one the user just saw on the quote card.
 */
export function findMatchingCetusRoute(
  swapExecuteInput: unknown,
  swapQuoteReads: SwapQuoteReadEntry[],
): SerializedCetusRoute | undefined {
  if (!isSwapExecuteInput(swapExecuteInput)) return undefined;
  if (swapQuoteReads.length === 0) return undefined;

  const target = normalizeSwapKey(swapExecuteInput);

  for (let i = swapQuoteReads.length - 1; i >= 0; i--) {
    const entry = swapQuoteReads[i];
    const candidate = normalizeSwapKey(entry.input);
    if (
      candidate.from === target.from &&
      candidate.to === target.to &&
      candidate.amount === target.amount &&
      candidate.byAmountIn === target.byAmountIn
    ) {
      return entry.result.serializedRoute;
    }
  }

  return undefined;
}

function isSwapExecuteInput(input: unknown): input is SwapExecuteInput {
  if (typeof input !== 'object' || input === null) return false;
  const obj = input as Record<string, unknown>;
  return typeof obj.from === 'string' && typeof obj.to === 'string' && typeof obj.amount === 'number';
}

function normalizeSwapKey(input: SwapQuoteInput | SwapExecuteInput): {
  from: string;
  to: string;
  amount: number;
  byAmountIn: boolean;
} {
  return {
    from: input.from.toLowerCase(),
    to: input.to.toLowerCase(),
    amount: input.amount,
    byAmountIn: input.byAmountIn ?? true,
  };
}
