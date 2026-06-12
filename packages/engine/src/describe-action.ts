/**
 * Generates user-facing descriptions for `PendingAction`s.
 *
 * Extracted from `engine.ts` in SPEC 7 P2.3 so both the legacy
 * single-write yield path AND the new bundle-composer (`compose-bundle.ts`)
 * can derive per-step descriptions from the same source.
 *
 * [P4.1 Phase C — 2026-05-25] Refactored to take `toolName: string`
 * instead of `tool: Tool`. The function only ever read `tool.name`, so
 * the dependency on the legacy `Tool` shape was incidental. After the
 * AI SDK Hardening rewrite, callers pass tool names directly (looked up
 * from the dispatched tool-call event or bundle composition input).
 */
import type { PendingToolCall } from './types.js';

function resolveTokenSymbol(nameOrType: string): string {
  if (!nameOrType.includes('::')) return nameOrType;
  const parts = nameOrType.split('::');
  return parts[parts.length - 1];
}

export function describeAction(toolName: string, call: PendingToolCall): string {
  const input = call.input as Record<string, unknown>;
  // [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] save_deposit / borrow /
  // claim_rewards cases removed with their tools. withdraw / repay_debt /
  // swap_execute stay through the 7-day exit window (§2d).
  switch (toolName) {
    case 'withdraw': {
      const wAsset = input.asset ?? '';
      return `Withdraw ${input.amount}${wAsset ? ' ' + wAsset : ''} from lending`;
    }
    case 'send_transfer':
      return `Send $${input.amount} to ${input.to}`;
    case 'repay_debt': {
      // [1.13.1] repay_debt enforces "repay with the same asset as the
      // borrow" per savings-usdc-only.mdc; surfacing the asset here makes
      // the bundle confirm card honest about which debt leg is being paid.
      const rAsset = (input.asset as string | undefined) ?? 'USDC';
      return `Repay $${input.amount} ${rAsset} of outstanding debt`;
    }
    case 'mpp_call': {
      const max = input.maxPriceUsd;
      let host = 'a Service';
      try {
        host = new URL(String(input.url ?? '')).host;
      } catch {
        // fall through to the generic label
      }
      return `Call & pay for ${host}${max ? ` (up to $${max} USDC)` : ''}`;
    }
    case 'swap_execute': {
      const from = resolveTokenSymbol(String(input.from ?? '?'));
      const to = resolveTokenSymbol(String(input.to ?? '?'));
      const amt = input.amount ?? '?';
      const slippagePct = ((input.slippage as number) ?? 0.01) * 100;
      return `Swap ${amt} ${from} for ${to} (${slippagePct}% max slippage)`;
    }
    default:
      return `Execute ${toolName}`;
  }
}
