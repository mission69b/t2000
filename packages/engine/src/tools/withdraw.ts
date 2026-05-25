import { tool } from 'ai';
import { z } from 'zod';
// [SPEC AI SDK HARDENING P4.1 Batch 5 / 2026-05-25] Native AI SDK shape.
import {
  wrapEngineExecute,
  buildNeedsApproval,
} from '../v2/tool-helpers.js';
import type { PreflightResult, ToolContext, ToolResult } from '../types.js';
import { requireAgent } from './utils.js';

// ---------------------------------------------------------------------------
// Shared business logic — same body backs the native + legacy exports
// ---------------------------------------------------------------------------
const withdrawDescription =
  'Withdraw USDC or USDsui from NAVI lending back to wallet. Defaults to USDC. ' +
  'Audric supports ONLY USDC and USDsui — these are the same two stables save_deposit accepts. ' +
  'NAVI may also surface legacy positions (USDe, SUI, etc.) in savings_info / balance_check; those are READ-ONLY through Audric. ' +
  'For non-canonical positions, direct the user to NAVI\'s app (https://app.naviprotocol.io) — Audric will not withdraw them. ' +
  'Payment Intent: composable — when paired with another composable write in the same request (e.g. "withdraw and send to Mom"), emit all calls in the same assistant turn so the engine compiles them into one atomic Payment Intent the user signs once.';

const withdrawInputSchema = z.object({
  amount: z.number().positive().describe('Exact amount to withdraw in token units'),
  asset: z
    .string()
    .optional()
    .describe(
      'Asset to withdraw — USDC (default) or USDsui only. Other assets surfaced in savings_info are read-only via Audric; direct the user to https://app.naviprotocol.io for those.',
    ),
});

type WithdrawInput = z.infer<typeof withdrawInputSchema>;

interface WithdrawOutput {
  success: boolean;
  tx: string;
  amount: number;
  asset: string;
  gasCost?: number;
}

function withdrawPreflight(input: WithdrawInput): PreflightResult {
  if (input.amount <= 0) {
    return { valid: false, error: 'Amount must be positive.' };
  }
  if (input.amount > 10_000_000) {
    return { valid: false, error: 'Amount unreasonable (max 10M).' };
  }
  if (input.asset !== undefined) {
    const normalized = input.asset.toUpperCase();
    if (normalized !== 'USDC' && normalized !== 'USDSUI') {
      return {
        valid: false,
        error: `Only USDC and USDsui can be withdrawn through Audric. Got "${input.asset}". Other positions surfaced in savings_info are read-only — direct the user to https://app.naviprotocol.io.`,
      };
    }
  }
  return { valid: true };
}

async function withdrawCallBody(
  input: WithdrawInput,
  context: ToolContext,
): Promise<ToolResult<WithdrawOutput>> {
  const agent = requireAgent(context);
  const result = await agent.withdraw({
    amount: input.amount,
    asset: input.asset,
  });

  const withdrawnAsset = (result as { asset?: string }).asset ?? input.asset ?? 'USDC';
  return {
    data: {
      success: result.success,
      tx: result.tx,
      amount: result.amount,
      asset: withdrawnAsset,
      gasCost: result.gasCost,
    },
    displayText: `Withdrew ${result.amount.toFixed(result.amount < 1 ? 6 : 2)} ${withdrawnAsset} (tx: ${result.tx.slice(0, 8)}…)`,
  };
}

export const withdrawTool = tool({
  description: withdrawDescription,
  inputSchema: withdrawInputSchema,
  needsApproval: buildNeedsApproval('withdraw'),
  execute: wrapEngineExecute<WithdrawInput, WithdrawOutput>(
    'withdraw',
    {
      preflight: withdrawPreflight,
      call: withdrawCallBody,
    },
  ),
});
