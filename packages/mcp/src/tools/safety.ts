import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { T2000 } from '@t2000/sdk';
import { errorResult } from '../errors.js';

export function registerSafetyTools(server: McpServer, agent: T2000): void {
  server.tool(
    't2000_config',
    'View or set agent safeguard limits (per-transaction max, daily send limit). Use action "show" to view current limits, "set" to update. Values are in dollars. Set to 0 for unlimited.',
    {
      action: z.enum(['show', 'set']).describe('"show" to view current limits, "set" to update a limit'),
      key: z.string().optional().describe('Setting to update: "maxPerTx" or "maxDailySend"'),
      value: z.number().optional().describe('New value in dollars (0 = unlimited)'),
    },
    async ({ action, key, value }) => {
      try {
        if (action === 'show') {
          const config = agent.enforcer.getConfig();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                locked: config.locked,
                maxPerTx: config.maxPerTx,
                maxDailySend: config.maxDailySend,
                dailyUsed: config.dailyUsed,
              }),
            }],
          };
        }

        if (!key || value === undefined) {
          return errorResult(new Error('Both "key" and "value" are required for action "set"'));
        }

        if (key === 'locked') {
          return errorResult(new Error('Cannot set "locked" via config. Use t2000_lock to freeze operations.'));
        }

        if (key !== 'maxPerTx' && key !== 'maxDailySend') {
          return errorResult(new Error(`Unknown key "${key}". Valid keys: "maxPerTx", "maxDailySend"`));
        }

        if (value < 0) {
          return errorResult(new Error('Value must be a non-negative number'));
        }

        agent.enforcer.set(key, value);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ updated: true, key, value }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_lock',
    'Freeze all agent operations immediately. Only a human can unlock via `t2000 unlock` in the terminal. Use this as an emergency stop.',
    {},
    async () => {
      try {
        agent.enforcer.lock();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              locked: true,
              message: 'Agent locked. Only a human can unlock via: t2000 unlock',
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
