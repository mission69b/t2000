import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const voloStakeTool = buildTool({
  name: 'volo_stake',
  description:
    'Stake SUI for vSUI via VOLO liquid staking. Earn ~3-5% APY. Rewards compound automatically via exchange rate — no claiming needed. Minimum 1 SUI.',
  inputSchema: z.object({
    amount: z.number().min(1).describe('Amount of SUI to stake (minimum 1)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Amount of SUI to stake' },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.stakeVSui({ amount: input.amount });

    return {
      data: {
        tx: result.tx,
        amountSui: result.amountSui,
        vSuiReceived: result.vSuiReceived,
        apy: result.apy,
        gasCost: result.gasCost,
      },
      displayText: `Staked ${result.amountSui} SUI for ${result.vSuiReceived.toFixed(4)} vSUI at ${(result.apy * 100).toFixed(2)}% APY (tx: ${result.tx.slice(0, 8)}...)`,
    };
  },
});
