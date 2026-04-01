import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const transactionHistoryTool = buildTool({
  name: 'transaction_history',
  description:
    'Retrieve recent transaction history: past sends, saves, withdrawals, borrows, repayments, and rewards claims. Optionally limit the number of results.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return (1-50, default 10)',
      },
    },
  },
  isReadOnly: true,

  async call(input, context) {
    const agent = requireAgent(context);
    const records = await agent.history({ limit: input.limit ?? 10 });

    return {
      data: {
        transactions: records,
        count: records.length,
      },
      displayText: `${records.length} recent transaction(s)`,
    };
  },
});
