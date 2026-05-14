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
  preflight: (input) => {
    // Defensive: preflight may run before Zod in resume-with-input flow,
    // where the form values come from the user and may be malformed.
    if (typeof input.name !== 'string') {
      return { valid: false, error: 'Contact name is required.' };
    }
    const trimmed = input.name.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Contact name cannot be empty.' };
    }
    if (trimmed.length > 64) {
      return { valid: false, error: 'Contact name too long (max 64 chars).' };
    }
    if (typeof input.address !== 'string') {
      return { valid: false, error: 'Contact address is required.' };
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(input.address)) {
      return {
        valid: false,
        error: `Invalid Sui address format: "${input.address}". Must be 0x followed by 64 hex characters.`,
      };
    }
    return { valid: true };
  },

  async call(input) {
    return {
      data: { saved: true, name: input.name, address: input.address },
      displayText: `Saved contact "${input.name}" (${input.address.slice(0, 8)}…)`,
    };
  },
});
