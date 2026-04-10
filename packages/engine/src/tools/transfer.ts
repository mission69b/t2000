import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const sendTransferTool = buildTool({
  name: 'send_transfer',
  description:
    'Send USDC to another Sui address or contact name. Validates the address, checks balance, and executes the on-chain transfer. Returns tx hash, gas cost, and updated balance.',
  inputSchema: z.object({
    to: z.string().min(1),
    amount: z.number().positive(),
    memo: z.string().optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Sui address (0x…) or saved contact name',
      },
      amount: {
        type: 'number',
        description: 'Amount in USD to send',
      },
      memo: {
        type: 'string',
        description: 'Optional note attached to the transfer (shown in transaction receipt)',
      },
    },
    required: ['to', 'amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.send({ to: input.to, amount: input.amount });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        to: result.to,
        contactName: result.contactName,
        gasCost: result.gasCost,
        gasMethod: result.gasMethod,
        balance: result.balance,
        memo: input.memo ?? null,
      },
      displayText: `Sent $${result.amount.toFixed(2)} to ${result.contactName ?? result.to.slice(0, 10)}… (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
