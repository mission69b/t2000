import { tool } from 'ai';
import { z } from 'zod';
// [SPEC AI SDK HARDENING P4.1 Batch 2 / 2026-05-25] Native AI SDK shape.
import {
  wrapEngineExecute,
  buildNeedsApproval,
} from '../v2/tool-helpers.js';
import {
  resolveSuinsViaRpc,
  resolveAddressToSuinsViaRpc,
  SUI_ADDRESS_REGEX,
  SUINS_NAME_REGEX,
  SuinsRpcError,
} from '../sui/address.js';
import type {
  ToolContext,
  ToolResult,
  PreflightResult,
} from '../types.js';

// ---------------------------------------------------------------------------
// resolve_suins — SuiNS lookup primitive (forward + reverse)
//
// The six address-accepting read tools (balance/health/savings/history/
// activity-summary/portfolio-analysis) call `normalizeAddressInput()`
// internally so the LLM can pass `address: "alex.sui"` and get the
// resolution for free. This tool is the *explicit* lookup primitive for
// queries the LLM can't satisfy with another tool — primarily:
//
//   FORWARD (name → address):
//     "What's the address of obehi.sui?"        → returns the 0x address
//     "Is bob.sui registered?"                   → returns registered: false
//     "Who owns alex.sui?"                       → returns the address
//
//   REVERSE (address → name):
//     "What's the SuiNS for 0xa671..3244?"       → returns "ossy.sui"
//     "Does this address have a SuiNS?"          → returns names[]
//     "Show me the .sui name for 0x40cd...3e62"  → returns "funkii.sui"
//
// v1.3 adds the reverse direction (was forward-only in v1.2) so
// "what's the suins for 0x..." stops bouncing the user to SuiScan.
//
// Single polymorphic input (`query`) keeps the schema tiny — the tool
// detects direction by regex (0x prefix → reverse, .sui suffix →
// forward). Without this tool the LLM was previously trying
// `web_search` (which can't index SuiNS) or pointing the user at
// third-party explorers, both of which are the wrong answer.
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  query: z
    .string()
    .describe(
      'Either a SuiNS name (e.g. "alex.sui", "team.alex.sui") to FORWARD-resolve to its 0x address, ' +
        'OR a Sui address (0x… 64 hex chars) to REVERSE-resolve to its registered SuiNS name(s). ' +
        'The engine detects direction by input shape.',
    ),
});

interface ResolveSuinsResult {
  /** Direction the lookup ran in. */
  direction: 'forward' | 'reverse';
  /** The original query, lowercased. */
  query: string;
  /** Forward only: the resolved 0x address (null when unregistered). */
  address?: string | null;
  /** Forward only: convenience flag for the LLM. */
  registered?: boolean;
  /** Reverse only: every SuiNS name pointing at this address (sorted by registry). */
  names?: string[];
  /** Reverse only: the first name in `names` (the conventional "primary"), or null. */
  primary?: string | null;
}

// ---------------------------------------------------------------------------
// Shared business logic — same body backs the native + legacy exports
// ---------------------------------------------------------------------------
const resolveSuinsDescription =
  'Look up SuiNS records on-chain — works in BOTH directions. ' +
  'FORWARD: pass a SuiNS name (e.g. "alex.sui") to get the 0x address it resolves to. ' +
  'REVERSE: pass a Sui 0x address to get the SuiNS name(s) registered for it (returns the ' +
  'primary name + the full list). ' +
  '\n\nUse this WHENEVER the user mentions a `.sui` name OR asks "what\'s the SuiNS for 0x…", ' +
  '"does 0x… have a name", "who is 0x…". You MUST call this tool — never guess from saved ' +
  'contacts (a contact named "alex" is NOT the same as the SuiNS name "alex.sui"; verify on-chain). ' +
  'Never guess a SuiNS mapping from memory — this tool queries the canonical on-chain RPC. ' +
  '\n\nReturns `{ direction, address, registered }` for forward, ' +
  '`{ direction, names, primary }` for reverse. Empty `names: []` means the address has no SuiNS records. ' +
  '\n\nNOTE: For money-flow questions about a `.sui` name ("what\'s alex.sui\'s balance / portfolio / ' +
  'health / transactions"), call the relevant read tool directly with `address: "alex.sui"` — those ' +
  'tools normalize SuiNS internally, so an explicit `resolve_suins` round-trip is wasted.';

type ResolveSuinsInput = z.infer<typeof inputSchema>;

function resolveSuinsPreflight(input: ResolveSuinsInput): PreflightResult {
  const trimmed = input.query?.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, error: 'query is required' };
  }
  const isAddress = SUI_ADDRESS_REGEX.test(trimmed);
  const isName = SUINS_NAME_REGEX.test(trimmed);
  if (!isAddress && !isName) {
    return {
      valid: false,
      error:
        `"${input.query}" doesn't look like a SuiNS name or a Sui address. ` +
        `Pass either a name ending in .sui (e.g. alex.sui) or a 0x-prefixed hex address.`,
    };
  }
  return { valid: true };
}

async function resolveSuinsCallBody(
  input: ResolveSuinsInput,
  context: ToolContext,
): Promise<ToolResult<ResolveSuinsResult>> {
    const query = input.query.trim().toLowerCase();
    const isAddress = SUI_ADDRESS_REGEX.test(query);

    try {
      if (isAddress) {
        const names = await resolveAddressToSuinsViaRpc(query, {
          suiRpcUrl: context.suiRpcUrl,
          signal: context.signal,
        });
        const primary = names[0] ?? null;
        const result: ResolveSuinsResult = {
          direction: 'reverse',
          query,
          names,
          primary,
        };
        return {
          data: result,
          displayText: primary
            ? `\`${query.slice(0, 10)}…${query.slice(-6)}\` → ${primary}${names.length > 1 ? ` (+${names.length - 1} more)` : ''}`
            : `\`${query.slice(0, 10)}…${query.slice(-6)}\` has no SuiNS name registered.`,
        };
      }

      // Forward direction: name → address.
      const address = await resolveSuinsViaRpc(query, {
        suiRpcUrl: context.suiRpcUrl,
        signal: context.signal,
      });
      const result: ResolveSuinsResult = {
        direction: 'forward',
        query,
        address,
        registered: address !== null,
      };
      return {
        data: result,
        displayText: address
          ? `${query} → \`${address.slice(0, 10)}…${address.slice(-6)}\``
          : `${query} is not a registered SuiNS name.`,
      };
    } catch (err) {
      // Surface RPC failures as a tool-level error so the LLM can narrate
      // ("the SuiNS service is temporarily unreachable, try again in a
      // moment") instead of pretending the lookup returned empty.
      if (err instanceof SuinsRpcError) {
        throw err;
      }
      throw err;
    }
}

export const resolveSuinsTool = tool({
  description: resolveSuinsDescription,
  inputSchema,
  needsApproval: buildNeedsApproval('resolve_suins'),
  execute: wrapEngineExecute<ResolveSuinsInput, ResolveSuinsResult>(
    'resolve_suins',
    {
      preflight: resolveSuinsPreflight,
      call: resolveSuinsCallBody,
    },
  ),
});
