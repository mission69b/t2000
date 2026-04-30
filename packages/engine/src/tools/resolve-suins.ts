import { z } from 'zod';
import { buildTool } from '../tool.js';
import {
  resolveSuinsViaRpc,
  SUINS_NAME_REGEX,
  SuinsRpcError,
} from '../sui-address.js';

// ---------------------------------------------------------------------------
// resolve_suins — explicit SuiNS lookup
//
// The six address-accepting read tools (balance/health/savings/history/
// activity-summary/portfolio-analysis) call `normalizeAddressInput()`
// internally so the LLM can pass `address: "alex.sui"` and get the
// resolution for free. This tool is the *explicit* lookup primitive for
// queries the LLM can't satisfy with another tool — primarily:
//
//   - "What's the address of obehi.sui?"          → returns the 0x address
//   - "Is bob.sui registered?"                     → returns registered: false
//   - "Who owns alex.sui?"                         → returns the address
//
// Without this tool the LLM was previously trying `web_search` (which
// can't index SuiNS) or falling back to local contact lookup, both of
// which produce wrong/unhelpful answers.
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  name: z
    .string()
    .describe(
      'A SuiNS name ending in `.sui` (e.g. "alex.sui", "team.alex.sui"). ' +
        'The engine resolves the name on-chain via Sui JSON-RPC.',
    ),
});

interface ResolveSuinsResult {
  /** The lookup name, lowercased and trimmed. */
  name: string;
  /** The resolved 0x address, or null when the name isn't registered. */
  address: string | null;
  /** True when the name resolves to an address. */
  registered: boolean;
}

export const resolveSuinsTool = buildTool({
  name: 'resolve_suins',
  description:
    'Resolve a SuiNS name (e.g. "alex.sui", "obehi.sui") to its on-chain Sui address. ' +
    'Use this whenever the user asks for the address of a `.sui` name, asks who owns a name, ' +
    'or wants to verify a SuiNS name is registered. Returns the 0x-prefixed 64-hex address, ' +
    'or `registered: false` when the name isn\'t registered. Never use `web_search` for this — ' +
    'web_search doesn\'t index SuiNS records, but this tool queries the canonical on-chain registry. ' +
    'NOTE: For lookup queries about money flows ("what\'s alex.sui\'s balance / portfolio / health / ' +
    'transactions"), call the relevant read tool directly with `address: "alex.sui"` — those tools ' +
    'normalize SuiNS names internally, so an explicit `resolve_suins` round-trip is wasted.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'A SuiNS name ending in .sui (e.g. "alex.sui"). The engine resolves it on-chain.',
      },
    },
    required: ['name'],
  },
  isReadOnly: true,
  // Names map to addresses on a per-block basis (registry can change).
  // Cheap, deterministic for a given block — safe to dedupe within a turn.
  cacheable: true,
  preflight: (input) => {
    const trimmed = input.name?.trim().toLowerCase();
    if (!trimmed) {
      return { valid: false, error: 'name is required' };
    }
    if (!SUINS_NAME_REGEX.test(trimmed)) {
      return {
        valid: false,
        error:
          `"${input.name}" doesn't look like a SuiNS name. Names must end in .sui ` +
          `and use only lowercase letters, digits, and hyphens (e.g. alex.sui).`,
      };
    }
    return { valid: true };
  },

  async call(input, context) {
    const name = input.name.trim().toLowerCase();
    let address: string | null;
    try {
      address = await resolveSuinsViaRpc(name, {
        suiRpcUrl: context.suiRpcUrl,
        signal: context.signal,
      });
    } catch (err) {
      // Surface RPC failures as a tool-level error so the LLM can narrate
      // ("the SuiNS service is temporarily unreachable, try again in a
      // moment") instead of pretending the name isn't registered.
      if (err instanceof SuinsRpcError) {
        throw err;
      }
      throw err;
    }

    const result: ResolveSuinsResult = {
      name,
      address,
      registered: address !== null,
    };

    return {
      data: result,
      displayText: address
        ? `${name} → \`${address.slice(0, 10)}…${address.slice(-6)}\``
        : `${name} is not a registered SuiNS name.`,
    };
  },
});
