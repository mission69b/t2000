import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const claimRewardsTool = buildTool({
  name: 'claim_rewards',
  description:
    'Claim all pending protocol rewards across lending adapters. Returns claimed reward details and total USD value.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true },

  async call(_input, context) {
    const agent = requireAgent(context);
    const result = await agent.claimRewards();

    return {
      data: {
        success: result.success,
        tx: result.tx || null,
        rewards: result.rewards,
        totalValueUsd: result.totalValueUsd,
        gasCost: result.gasCost,
      },
      displayText: result.rewards.length === 0
        ? 'No pending rewards to claim.'
        : `Claimed $${result.totalValueUsd.toFixed(2)} in rewards (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
