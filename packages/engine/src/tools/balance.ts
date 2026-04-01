import { z } from 'zod';
import { fetchBalance } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, getWalletAddress, requireAgent } from './utils.js';

export const balanceCheckTool = buildTool({
  name: 'balance_check',
  description:
    'Get the user\'s full balance breakdown: available USDC, savings deposits, outstanding debt, pending rewards, gas reserve, and total net worth.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,

  async call(_input, context) {
    if (hasNaviMcp(context)) {
      const bal = await fetchBalance(
        getMcpManager(context),
        getWalletAddress(context),
      );
      return {
        data: bal,
        displayText: `Balance: $${bal.total.toFixed(2)} (Available: $${bal.available.toFixed(2)}, Savings: $${bal.savings.toFixed(2)})`,
      };
    }

    const agent = requireAgent(context);
    const balance = await agent.balance();

    const gasReserveUsd = typeof balance.gasReserve === 'number'
      ? balance.gasReserve
      : (balance.gasReserve as { usdEquiv: number }).usdEquiv ?? 0;
    const stablesTotal = typeof balance.stables === 'number'
      ? balance.stables
      : Object.values(balance.stables as Record<string, number>).reduce((a: number, b: number) => a + b, 0);

    return {
      data: {
        available: balance.available,
        savings: balance.savings,
        debt: balance.debt,
        pendingRewards: balance.pendingRewards,
        gasReserve: gasReserveUsd,
        total: balance.total,
        stables: stablesTotal,
      },
      displayText: `Balance: $${balance.total.toFixed(2)} (Available: $${balance.available.toFixed(2)}, Savings: $${balance.savings.toFixed(2)})`,
    };
  },
});
