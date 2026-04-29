import { z } from 'zod';
import { ALL_NAVI_ASSETS, SUPPORTED_ASSETS, type SupportedAsset } from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

/**
 * Tokens send_transfer can move. Mirrors `SUPPORTED_ASSETS` so a new
 * coin in the SDK constants is automatically settable here without
 * touching the tool.
 *
 * The history of this tool: it was originally USDC-only (description
 * literally said "Send USDC..."). When the LLM was asked to send a
 * non-USDC token (e.g. just-swapped SUI), it would call send_transfer
 * with the SUI amount, and the tool would silently ship USDC instead —
 * the user lost real money. See the audric-send-safety-and-auth follow-up:
 * "Done! Swapped 1 USDC for 1.0561 SUI and sent it all to Wallet 1." was
 * the LLM's hallucinated success while only USDC actually moved.
 */
const ASSET_LIST = ALL_NAVI_ASSETS.map((a) => String(a)).join(', ');

export const sendTransferTool = buildTool({
  name: 'send_transfer',
  description:
    `Send ANY supported token (${ASSET_LIST}) to another Sui address or contact name. Validates the address, checks balance, and executes the on-chain transfer. ` +
    `MUST set the \`asset\` field to the token symbol you want to send (case-insensitive). If \`asset\` is omitted, USDC is assumed — only do this when the user explicitly asks for USDC. ` +
    `When the user asks to send a token by name (SUI, USDT, etc.) or to send the proceeds of a just-completed swap, you MUST pass \`asset\` matching that token. ` +
    `Returns tx hash, gas cost, and updated balance.`,
  inputSchema: z.object({
    to: z.string().min(1),
    amount: z.number().positive(),
    asset: z.string().optional(),
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
        description: 'Amount of the asset to send (denominated in the asset\u2019s own units, NOT USD). For USDC this is the USDC count; for SUI this is the SUI count.',
      },
      asset: {
        type: 'string',
        description: `Token symbol to send. One of: ${ASSET_LIST}. Defaults to USDC if omitted. REQUIRED whenever the user names a non-USDC token or you are forwarding the proceeds of a swap.`,
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
  flags: { mutating: true, requiresBalance: true, irreversible: true },
  preflight: (input) => {
    if (input.to.startsWith('0x') && !/^0x[a-fA-F0-9]{64}$/.test(input.to)) {
      return { valid: false, error: `Invalid Sui address format: "${input.to}". Must be 0x followed by 64 hex characters.` };
    }
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (input.to === ZERO_ADDRESS) {
      return { valid: false, error: 'This is the zero address (burn address). Sending funds here will permanently destroy them. If you really intend to burn tokens, please confirm explicitly.' };
    }
    if (input.amount <= 0) {
      return { valid: false, error: 'Amount must be positive.' };
    }
    if (input.asset !== undefined) {
      const normalized = String(input.asset).toUpperCase();
      if (!(normalized in SUPPORTED_ASSETS)) {
        return {
          valid: false,
          error: `Unsupported asset "${input.asset}". send_transfer accepts: ${ASSET_LIST}.`,
        };
      }
    }
    return { valid: true };
  },

  async call(input, context) {
    const agent = requireAgent(context);
    const asset = input.asset
      ? (String(input.asset).toUpperCase() as SupportedAsset)
      : 'USDC';
    const result = await agent.send({ to: input.to, amount: input.amount, asset });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        asset,
        to: result.to,
        contactName: result.contactName,
        gasCost: result.gasCost,
        balance: result.balance,
        memo: input.memo ?? null,
      },
      displayText: `Sent ${result.amount} ${asset} to ${result.contactName ?? `${result.to.slice(0, 10)}…`} (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
