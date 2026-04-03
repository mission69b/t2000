import { z } from 'zod';
import { buildTool } from '../tool.js';

export const saveContactTool = buildTool({
  name: 'save_contact',
  description:
    'Save a contact with a friendly name and Sui address so the user can send to them by name later.',
  inputSchema: z.object({
    name: z.string().describe('Friendly name for the contact (e.g. "Alex", "Mom")'),
    address: z.string().describe('Full Sui address (0x...)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Friendly name for the contact' },
      address: { type: 'string', description: 'Full Sui address (0x...)' },
    },
    required: ['name', 'address'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input) {
    return {
      data: { saved: true, name: input.name, address: input.address },
      displayText: `Saved contact "${input.name}" (${input.address.slice(0, 8)}…)`,
    };
  },
});
