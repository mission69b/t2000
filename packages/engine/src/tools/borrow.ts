import { z } from 'zod';
import { assertAllowedAsset } from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

// [v0.51.0] Allowed borrow assets — keep in sync with OPERATION_ASSETS.borrow.
const BORROW_ASSETS = ['USDC', 'USDsui'] as const;

export const borrowTool = buildTool({
  name: 'borrow',
  description:
    'Borrow USDC or USDsui against savings collateral. ONLY these two stables are supported. ' +
    'Requires existing savings deposits as collateral. Checks max safe borrow and health factor. ' +
    'Returns tx hash, fee, asset borrowed, and post-borrow health factor. ' +
    'When the user says "borrow 10 USDC" pass asset="USDC". When they say "borrow 10 USDsui" pass asset="USDsui". ' +
    'When they say "borrow 10" with no asset, default to USDC unless the user has only USDsui collateral. ' +
    'Payment Intent: composable — when paired with another composable write in the same request (e.g. "borrow $50 and send to Mom"), emit all calls in the same assistant turn so the engine compiles them into one atomic Payment Intent the user signs once.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.enum(BORROW_ASSETS).optional().describe('"USDC" or "USDsui". Defaults to USDC when omitted.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'Amount to borrow (in units of the chosen asset)',
      },
      asset: {
        type: 'string',
        enum: ['USDC', 'USDsui'],
        description: 'Stable to borrow. "USDC" or "USDsui". Defaults to USDC when omitted.',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true, affectsHealth: true },
  preflight: (input) => {
    if (input.asset) {
      const allowed = (BORROW_ASSETS as readonly string[]).map((a) => a.toUpperCase());
      if (!allowed.includes(input.asset.toUpperCase())) {
        return { valid: false, error: `Only USDC or USDsui borrows are supported. Got: "${input.asset}"` };
      }
    }
    return { valid: true };
  },

  async call(input, context) {
    assertAllowedAsset('borrow', input.asset);

    const agent = requireAgent(context);
    // [v0.51.0] Pass asset through — pre-v0.51 the SDK silently rewrote any
    // asset to 'USDC'. The runtime allow-list (assertAllowedAsset above) still
    // gates the input set, so this is safe.
    const asset = (input.asset as 'USDC' | 'USDsui' | undefined) ?? 'USDC';
    const result = await agent.borrow({ amount: input.amount, asset });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        asset: result.asset ?? asset,
        fee: result.fee,
        healthFactor: result.healthFactor,
        gasCost: result.gasCost,
      },
      displayText: `Borrowed ${result.amount.toFixed(2)} ${asset} — HF: ${result.healthFactor.toFixed(2)} (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
