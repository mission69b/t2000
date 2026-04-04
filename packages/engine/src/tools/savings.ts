import { z } from 'zod';
import { fetchSavings } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, getWalletAddress, requireAgent } from './utils.js';

export const savingsInfoTool = buildTool({
  name: 'savings_info',
  description:
    'Get detailed savings positions and earnings: current deposits by protocol, APY, total yield earned, daily earning rate, and projected monthly returns.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,

  async call(_input, context) {
    if (hasNaviMcp(context)) {
      const savings = await fetchSavings(
        getMcpManager(context),
        getWalletAddress(context),
      );
      return { data: savings };
    }

    const agent = requireAgent(context);
    const [posResult, earnings, fundStatus] = await Promise.all([
      agent.positions(),
      agent.earnings(),
      agent.fundStatus(),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = (posResult.positions ?? []).map((p: any) => ({
      protocol: (p.protocol ?? 'navi') as string,
      type: p.type === 'borrow' ? ('borrow' as const) : ('supply' as const),
      symbol: ((p.asset ?? p.symbol) ?? 'UNKNOWN') as string,
      amount: (p.amount ?? 0) as number,
      valueUsd: ((p.amountUsd ?? p.valueUsd) ?? 0) as number,
      apy: (p.apy ?? 0) as number,
      liquidationThreshold: (p.liquidationThreshold ?? 0) as number,
    }));

    return {
      data: {
        positions,
        earnings: {
          totalYieldEarned: earnings.totalYieldEarned,
          currentApy: earnings.currentApy,
          dailyEarning: earnings.dailyEarning,
          supplied: earnings.supplied,
        },
        fundStatus: {
          supplied: fundStatus.supplied,
          apy: fundStatus.apy,
          earnedToday: fundStatus.earnedToday,
          earnedAllTime: fundStatus.earnedAllTime,
          projectedMonthly: fundStatus.projectedMonthly,
        },
      },
    };
  },
});
