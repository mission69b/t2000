import { z } from 'zod';
import { assertAllowedAsset } from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

// [v0.51.0] Allowed save assets — keep in sync with OPERATION_ASSETS.save in
// @t2000/sdk. We assert via `assertAllowedAsset('save', ...)` at runtime, but
// the description + preflight + JSON schema also need to surface the allowed
// set so the LLM picks correctly without trial-and-error.
const SAVE_ASSETS = ['USDC', 'USDsui'] as const;

export const saveDepositTool = buildTool({
  name: 'save_deposit',
  description:
    'Deposit USDC or USDsui into NAVI savings to earn yield. ONLY these two stables are accepted. ' +
    'If the user asks to save/deposit any other token (GOLD, SUI, USDT, USDe, ETH, etc.), do NOT call this tool ' +
    'and do NOT automatically swap their tokens and deposit. Instead, tell the user that only USDC and USDsui ' +
    'deposits are supported and ask if they would like to swap first. Let the user decide — never auto-chain ' +
    'swap + deposit. ' +
    'When the user says "save 10 USDC" pass asset="USDC". When they say "save 10 USDsui" pass asset="USDsui". ' +
    'When they say "save 10" with no asset, ALWAYS call balance_check first and ask which stable they want to ' +
    'deposit (or default to whichever they hold more of, with a one-line note). Never silently substitute USDsui ' +
    'for USDC or vice versa. ' +
    'Payment Stream: bundleable — when paired with another bundleable write in the same request (e.g. "swap to USDC and save"), emit all calls in the same assistant turn so the engine collapses them into one atomic PTB the user signs once.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.enum(SAVE_ASSETS).optional().describe('"USDC" or "USDsui". Defaults to USDC when omitted.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount to deposit (in units of the chosen asset)',
      },
      asset: {
        type: 'string',
        enum: ['USDC', 'USDsui'],
        description: 'Stable to deposit. "USDC" or "USDsui". Defaults to USDC when omitted.',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true, requiresBalance: true },
  preflight: (input) => {
    if (input.asset) {
      const allowed = (SAVE_ASSETS as readonly string[]).map((a) => a.toUpperCase());
      if (!allowed.includes(input.asset.toUpperCase())) {
        return { valid: false, error: `Only USDC or USDsui deposits are supported. Got: "${input.asset}"` };
      }
    }
    return { valid: true };
  },

  async call(input, context) {
    assertAllowedAsset('save', input.asset);

    const agent = requireAgent(context);
    // [v0.51.0] Pass asset through — pre-v0.51 the SDK silently rewrote any
    // asset to 'USDC'. The runtime allow-list (assertAllowedAsset above) still
    // gates the input set, so this is safe.
    const asset = (input.asset as 'USDC' | 'USDsui' | undefined) ?? 'USDC';
    const result = await agent.save({ amount: input.amount, asset });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        asset,
        apy: result.apy,
        fee: result.fee,
        gasCost: result.gasCost,
        savingsBalance: result.savingsBalance,
      },
      displayText: `Saved ${result.amount.toFixed(result.amount < 1 ? 6 : 2)} ${asset} at ${(result.apy * 100).toFixed(2)}% APY (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
