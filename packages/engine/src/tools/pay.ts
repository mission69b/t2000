import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const payApiTool = buildTool({
  name: 'pay_api',
  description:
    'Access a paid API endpoint using on-chain micropayments (MPP). Sends the request, handles payment automatically, and returns the API response body. Use for accessing premium data services.',
  inputSchema: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
    body: z.string().optional(),
    headers: z.record(z.string()).optional(),
    maxPrice: z.number().positive().optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'API endpoint URL' },
      method: { type: 'string', description: 'HTTP method (default GET)' },
      body: { type: 'string', description: 'Request body (for POST/PUT)' },
      headers: { type: 'object', description: 'Additional HTTP headers' },
      maxPrice: { type: 'number', description: 'Maximum price in USD willing to pay' },
    },
    required: ['url'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.pay({
      url: input.url,
      method: input.method,
      body: input.body,
      headers: input.headers,
      maxPrice: input.maxPrice,
    });

    return {
      data: {
        status: result.status,
        body: result.body,
        paid: result.paid,
        cost: result.cost,
        receipt: result.receipt,
      },
      displayText: result.paid
        ? `API call completed — paid $${result.cost?.toFixed(4) ?? '?'} (status: ${result.status})`
        : `API call completed — free (status: ${result.status})`,
    };
  },
});
