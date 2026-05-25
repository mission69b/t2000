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
  switch (toolName) {
    case 'save_deposit': {
      // [1.13.1] Per the savings-usdc-only.mdc strategic exception, save_deposit
      // accepts both USDC and USDsui. The previous hardcoded 'USDC' rendered
      // a USDsui save as "Save 4.997 USDC into lending" on the bundle confirm
      // card, even though the on-chain action correctly deposited USDsui. Read
      // the asset from input (default USDC matches the SDK's allowAsset default).
      const sAsset = (input.asset as string | undefined) ?? 'USDC';
      return `Save ${input.amount} ${sAsset} into lending`;
    }
    case 'withdraw': {
      const wAsset = input.asset ?? '';
      return `Withdraw ${input.amount}${wAsset ? ' ' + wAsset : ''} from lending`;
    }
    case 'send_transfer':
      return `Send $${input.amount} to ${input.to}`;
    case 'borrow': {
      // [1.13.1] Same class of bug as save_deposit — borrow accepts USDC or
      // USDsui per the strategic exception, but the description didn't surface
      // the asset. Defaults to USDC to match the SDK's resolveSaveableAsset.
      const bAsset = (input.asset as string | undefined) ?? 'USDC';
      return `Borrow $${input.amount} ${bAsset} against collateral`;
    }
    case 'repay_debt': {
      // [1.13.1] repay_debt enforces "repay with the same asset as the
      // borrow" per savings-usdc-only.mdc; surfacing the asset here makes
      // the bundle confirm card honest about which debt leg is being paid.
      const rAsset = (input.asset as string | undefined) ?? 'USDC';
      return `Repay $${input.amount} ${rAsset} of outstanding debt`;
    }
    case 'claim_rewards':
      return 'Claim all pending protocol rewards';
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
