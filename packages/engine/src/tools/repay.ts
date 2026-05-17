import { z } from 'zod';
import { defineTool } from '../v2/define-tool.js';
import { requireAgent } from './utils.js';
// [v2.0.3 / 2026-05-17] Sub-cent residual debt is treated as zero —
// otherwise the LLM narrates "Remaining debt is minimal at $0.001"
// after a successful "Repay all debt" tap, which reads as a failure
// state. See ../dust.ts for the cross-tool rationale.
import { DEBT_DUST_USD } from '../dust.js';

const REPAY_ASSETS = ['USDC', 'USDsui'] as const;

export const repayDebtTool = defineTool({
  name: 'repay_debt',
  description:
    'Repay outstanding USDC or USDsui debt. Always call balance_check first to know the debt amount + which asset is owed (savings_info shows per-asset borrow positions). ' +
    'Pass asset="USDC" or asset="USDsui" to target a specific debt. When omitted, repays the highest-APY borrow first. ' +
    'Important: a USDsui debt MUST be repaid with USDsui (and USDC debt with USDC) — the SDK fetches the correct coin type for the targeted asset, but the user must hold enough of that stable in their wallet. ' +
    'If the user has only the wrong stable, do NOT auto-swap — tell them to swap manually first. Returns tx hash, amount repaid, asset, and remaining debt. ' +
    'Payment Intent: composable — when paired with another composable write in the same request (e.g. "repay debt then withdraw the rest"), emit all calls in the same assistant turn so the engine compiles them into one atomic Payment Intent the user signs once.',
  inputSchema: z.object({
    amount: z.number().positive().describe('Exact amount to repay (in units of the chosen asset; call balance_check first)'),
    asset: z.enum(REPAY_ASSETS).optional().describe('Asset of the borrow being repaid. "USDC" or "USDsui". When omitted, repays the highest-APY borrow first.'),
  }),
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true, requiresBalance: true },
  preflight: (input) => {
    if (input.asset) {
      const allowed = (REPAY_ASSETS as readonly string[]).map((a) => a.toUpperCase());
      if (!allowed.includes(input.asset.toUpperCase())) {
        return { valid: false, error: `Only USDC or USDsui repays are supported. Got: "${input.asset}"` };
      }
    }
    return { valid: true };
  },

  async call(input, context) {
    const agent = requireAgent(context);
    const asset = input.asset as 'USDC' | 'USDsui' | undefined;
    const result = await agent.repay({ amount: input.amount, asset });
    const repaidAsset = (result as { asset?: string }).asset ?? asset ?? 'USDC';

    // [v2.0.3 / 2026-05-17] Floor sub-DEBT_DUST_USD to 0. NAVI's lending
    // index accrues sub-cent interest between blocks; a "Repay all debt"
    // typically leaves ~$0.001-$0.005 dust that the user (and the LLM
    // narrating "Remaining debt is minimal at $0.001") would read as
    // a failure. Floor here so both the structured `data.remainingDebt`
    // the LLM sees AND the displayText render as "no remaining debt".
    const cleanRemainingDebt =
      result.remainingDebt < DEBT_DUST_USD ? 0 : result.remainingDebt;
    const isDebtClear = cleanRemainingDebt === 0;

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        asset: repaidAsset,
        remainingDebt: cleanRemainingDebt,
        gasCost: result.gasCost,
      },
      displayText: isDebtClear
        ? `Repaid ${result.amount.toFixed(2)} ${repaidAsset} — no remaining debt (tx: ${result.tx.slice(0, 8)}…)`
        : `Repaid ${result.amount.toFixed(2)} ${repaidAsset} — remaining debt: $${cleanRemainingDebt.toFixed(2)} (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
