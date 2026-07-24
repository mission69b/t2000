import { bcs } from '@mysten/sui/bcs';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { T2000Error } from '../errors.js';
import templateBytecode from './template-bytecode.json' with { type: 'json' };

/**
 * Agent-coin bytecode template — compiled ONCE from
 * `contracts/agent_capital/template/`, parameterized per launch by rewriting
 * identifiers + constants (`@mysten/move-bytecode-template`). No Move
 * toolchain at runtime, so a serverless console API can run the launch path.
 * Proven on mainnet: tx `4p1dgo7FwAU51mDSKFzSuWeGdeSLPmTVBSG3uayZhkQn`
 * (spike, tracker S.791/S.792).
 *
 * The template's `init` mints the full fixed supply to RECIPIENT, freezes
 * CoinMetadata, freezes TreasuryCap; the publish PTB burns the UpgradeCap.
 * The 50/50 LP/treasury split happens in the SECOND transaction (allocation
 * policy lives in the orchestrator, not the bytecode — see the template
 * source for why init can't do it).
 */

// Values compiled into template-bytecode.json — must match
// `contracts/agent_capital/template/sources/template.move` EXACTLY.
const TEMPLATE = {
  module: 'template',
  otw: 'TEMPLATE',
  symbol: 'TMPL',
  name: 'Template Coin',
  description: 'bytecode template placeholder',
  iconUrl: 'https://example.com/icon.svg',
  decimals: 6,
  totalSupply: 1_000_000_000_000_000n,
  recipient: normalizeSuiAddress('0xCAFE'),
} as const;

/** The locked v1 economics: 1B whole coins at 6 decimals (D-5 / L2-A). */
export const AGENT_TOKEN_DECIMALS = 6;
export const AGENT_TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000n;
/** 50% LP / 50% agent treasury. */
export const AGENT_TOKEN_LP_ALLOCATION = AGENT_TOKEN_TOTAL_SUPPLY / 2n;
export const AGENT_TOKEN_TREASURY_ALLOCATION =
  AGENT_TOKEN_TOTAL_SUPPLY - AGENT_TOKEN_LP_ALLOCATION;

export interface AgentCoinParams {
  /** Ticker, 2–8 chars A–Z0–9, becomes module name (lowercased) + OTW. */
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
  /** Receives the full minted supply — the LAUNCHER (who then signs the
   *  split/pool/lock transaction). Never a platform address. */
  recipient: string;
}

/**
 * Impersonation blocklist — top Sui-ecosystem + majors tickers an agent token
 * must not squat (SPEC_AGENT_CAPITAL guards; kept deliberately short and
 * high-confidence, console moderation covers the long tail).
 */
export const SYMBOL_BLOCKLIST = new Set([
  'SUI', 'USDC', 'USDT', 'USDSUI', 'WAL', 'CETUS', 'DEEP', 'NS', 'NAVX',
  'SCA', 'AFSUI', 'HASUI', 'VSUI', 'BUCK', 'FUD', 'BLUB', 'HIPPO',
  'BTC', 'WBTC', 'ETH', 'WETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE',
  'AVAX', 'LINK', 'TRX', 'TON', 'SHIB', 'PEPE', 'USDE', 'DAI', 'GOLD',
  'XAUM', 'T2000', 'T2K', 'AUDRIC',
]);

const SYMBOL_RE = /^[A-Z][A-Z0-9]{1,7}$/;

/** Validate launch params; throws `T2000Error('INVALID_AMOUNT'|…)` shapes the
 *  console can surface directly. */
export function validateAgentCoinParams(params: AgentCoinParams): void {
  const symbol = params.symbol.toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    throw new T2000Error(
      'INVALID_INPUT',
      `symbol must be 2-8 chars, A-Z then A-Z0-9 (got "${params.symbol}")`,
    );
  }
  if (SYMBOL_BLOCKLIST.has(symbol)) {
    throw new T2000Error(
      'INVALID_INPUT',
      `symbol ${symbol} impersonates an existing ticker`,
    );
  }
  if (!params.name.trim() || params.name.length > 64) {
    throw new T2000Error('INVALID_INPUT', 'name must be 1-64 chars');
  }
  if (params.description.length > 256) {
    throw new T2000Error('INVALID_INPUT', 'description must be ≤256 chars');
  }
  if (!/^https:\/\/.+/.test(params.iconUrl) || params.iconUrl.length > 256) {
    throw new T2000Error('INVALID_INPUT', 'iconUrl must be https and ≤256 chars');
  }
  if (!isValidSuiAddress(params.recipient)) {
    throw new T2000Error('INVALID_ADDRESS', `bad recipient: ${params.recipient}`);
  }
}

export interface AgentCoinModule {
  /** Rewritten module bytecode, ready for `tx.publish`. */
  modules: number[][];
  dependencies: string[];
  /** Lowercased module name — the published coin type is
   *  `<pkg>::<moduleName>::<otw>`. */
  moduleName: string;
  otw: string;
}

/**
 * Rewrite the compiled template for one agent's launch. Deterministic — same
 * params, same bytes. Async because `@mysten/move-bytecode-template` (WASM)
 * is loaded lazily HERE, not at module top level: a top-level import makes
 * every SDK consumer's bundler ship/locate the .wasm at startup, which broke
 * the CLI bundle in CI — only the launch path may pay that cost.
 */
export async function buildAgentCoinModule(
  params: AgentCoinParams,
): Promise<AgentCoinModule> {
  const { deserialize, serialize, update_constants, update_identifiers } =
    await import('@mysten/move-bytecode-template');
  validateAgentCoinParams(params);
  const symbol = params.symbol.toUpperCase();
  const moduleName = symbol.toLowerCase();
  const recipient = normalizeSuiAddress(params.recipient);

  let bytes: Uint8Array = Uint8Array.from(
    Buffer.from(templateBytecode.modules[0], 'base64'),
  );
  deserialize(bytes); // throws if the checked-in template is malformed

  // OTW rule: struct name must be the uppercased module name.
  bytes = update_identifiers(bytes, {
    [TEMPLATE.module]: moduleName,
    [TEMPLATE.otw]: symbol,
  });

  const str = (s: string) => bcs.string().serialize(s).toBytes();
  const rewrites: Array<[Uint8Array, Uint8Array, string]> = [
    [str(symbol), str(TEMPLATE.symbol), 'Vector(U8)'],
    [str(params.name), str(TEMPLATE.name), 'Vector(U8)'],
    [str(params.description), str(TEMPLATE.description), 'Vector(U8)'],
    [str(params.iconUrl), str(TEMPLATE.iconUrl), 'Vector(U8)'],
    [
      bcs.Address.serialize(recipient).toBytes(),
      bcs.Address.serialize(TEMPLATE.recipient).toBytes(),
      'Address',
    ],
    // Supply + decimals are LOCKED v1 constants — not caller-parameterized —
    // but rewritten anyway so a drifted template recompile can't silently
    // change the economics out from under this module's exported constants.
    [
      bcs.u64().serialize(AGENT_TOKEN_TOTAL_SUPPLY).toBytes(),
      bcs.u64().serialize(TEMPLATE.totalSupply).toBytes(),
      'U64',
    ],
  ];
  for (const [next, prev, type] of rewrites) {
    bytes = update_constants(bytes, next, prev, type);
  }
  serialize(deserialize(bytes)); // round-trip sanity after rewrite

  return {
    modules: [Array.from(bytes)],
    dependencies: templateBytecode.dependencies,
    moduleName,
    otw: symbol,
  };
}
