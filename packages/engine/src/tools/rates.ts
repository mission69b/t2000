import { z } from 'zod';
import { fetchRates } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, requireAgent } from './utils.js';

function formatRatesSummary(rates: Record<string, { saveApy: number; borrowApy: number }>): string {
  return Object.entries(rates)
    .map(([asset, r]) => `${asset}: Save ${(r.saveApy * 100).toFixed(2)}% / Borrow ${(r.borrowApy * 100).toFixed(2)}%`)
    .join(', ');
}

export const ratesInfoTool = buildTool({
  name: 'rates_info',
  description:
    'Get current lending/borrowing interest rates (APY) for all supported assets. Returns save APY and borrow APY per asset.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,

  async call(_input, context) {
    if (hasNaviMcp(context)) {
      const rates = await fetchRates(getMcpManager(context));
      return {
        data: rates,
        displayText: formatRatesSummary(rates),
      };
    }

    const agent = requireAgent(context);
    const rates = await agent.rates();

    return {
      data: rates,
      displayText: formatRatesSummary(rates),
    };
  },
});
