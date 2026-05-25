import { tool } from 'ai';
import { z } from 'zod';
import { ALL_NAVI_ASSETS, SUPPORTED_ASSETS, normalizeAsset, type BalanceResponse, type SupportedAsset } from '@t2000/sdk';
// [SPEC AI SDK HARDENING P4.1 Batch 6 / 2026-05-25] Native AI SDK shape.
import {
  wrapEngineExecute,
  buildNeedsApproval,
} from '../v2/tool-helpers.js';
import type { PreflightResult, ToolContext, ToolResult } from '../types.js';
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

// ---------------------------------------------------------------------------
// Shared business logic — same body backs the native + legacy exports
// ---------------------------------------------------------------------------
const sendTransferDescription =
  `Send ANY supported token (${ASSET_LIST}) to another Sui address or contact name. Validates the address, checks balance, and executes the on-chain transfer. ` +
  `MUST set the \`asset\` field to the token symbol you want to send (case-insensitive). If \`asset\` is omitted, USDC is assumed — only do this when the user explicitly asks for USDC. ` +
  `When the user asks to send a token by name (SUI, USDT, etc.) or to send the proceeds of a just-completed swap, you MUST pass \`asset\` matching that token. ` +
  `Returns tx hash, gas cost, and updated balance. ` +
  `Payment Intent: composable — when paired with another composable write in the same request (e.g. "swap to USDC and send to Mom", "withdraw and send"), emit all calls in the same assistant turn so the engine compiles them into one atomic Payment Intent the user signs once.`;

const sendTransferInputSchema = z.object({
  to: z.string().min(1).describe('Sui address (0x…) or saved contact name'),
  amount: z
    .number()
    .positive()
    .describe(
      'Amount of the asset to send (denominated in the asset\u2019s own units, NOT USD). For USDC this is the USDC count; for SUI this is the SUI count.',
    ),
  asset: z
    .string()
    .optional()
    .describe(
      `Token symbol to send. One of: ${ASSET_LIST}. Defaults to USDC if omitted. REQUIRED whenever the user names a non-USDC token or you are forwarding the proceeds of a swap.`,
    ),
  memo: z
    .string()
    .nullable()
    .describe('Optional note attached to the transfer (shown in transaction receipt). Pass null when no memo is needed.'),
});

type SendTransferInput = z.infer<typeof sendTransferInputSchema>;

interface SendTransferOutput {
  success: boolean;
  tx: string;
  amount: number;
  asset: SupportedAsset;
  to: string;
  contactName?: string;
  gasCost?: number;
  balance?: BalanceResponse;
  memo: string | null;
}

function sendTransferPreflight(input: SendTransferInput): PreflightResult {
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
    // F10 fix (P2.7 soak, 2026-05-03): SUPPORTED_ASSETS keys are mostly
    // uppercase (USDC, SUI, ETH) but `USDe` and `USDsui` are mixed case.
    // The pre-fix `String(input.asset).toUpperCase() in SUPPORTED_ASSETS`
    // check rejected USDsui ("USDSUI" not in registry) and USDe ("USDE"
    // not in registry). `normalizeAsset` is the canonical case-insensitive
    // resolver from @t2000/sdk — already used by the NAVI adapter, returns
    // the original input unchanged when no match is found so `in` still
    // rejects truly unsupported tokens.
    const normalized = normalizeAsset(String(input.asset));
    if (!(normalized in SUPPORTED_ASSETS)) {
      return {
        valid: false,
        error: `Unsupported asset "${input.asset}". send_transfer accepts: ${ASSET_LIST}.`,
      };
    }
  }
  return { valid: true };
}

async function sendTransferCallBody(
  input: SendTransferInput,
  context: ToolContext,
): Promise<ToolResult<SendTransferOutput>> {
  const agent = requireAgent(context);
  const asset = input.asset
    ? (normalizeAsset(String(input.asset)) as SupportedAsset)
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
}

export const sendTransferTool = tool({
  description: sendTransferDescription,
  inputSchema: sendTransferInputSchema,
  needsApproval: buildNeedsApproval('send_transfer'),
  execute: wrapEngineExecute<SendTransferInput, SendTransferOutput>(
    'send_transfer',
    {
      preflight: sendTransferPreflight,
      call: sendTransferCallBody,
    },
  ),
});
