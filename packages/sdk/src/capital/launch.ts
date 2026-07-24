import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { T2000Error } from '../errors.js';
import { USDC_TYPE } from '../token-registry.js';
import type { SuiCoreClient } from '../utils/sui.js';
import { selectAndSplitCoin } from '../wallet/coinSelection.js';
import {
  CETUS_POSITION_TYPE,
  createPoolV2,
  positionPoolId,
  sqrtPriceX64FromAmounts,
} from '../protocols/cetus-clmm.js';
import {
  AGENT_TOKEN_LP_ALLOCATION,
  AGENT_TOKEN_TREASURY_ALLOCATION,
  buildAgentCoinModule,
  type AgentCoinParams,
} from './template.js';

/**
 * Agent Capital launch orchestrator (SPEC_ACP_SUI §6, decisions D-5 + L2-A).
 *
 * A launch is TWO launcher-signed transactions:
 *
 *   PTB 1 — `buildPublishAgentCoinTx`: publish the rewritten coin package +
 *   burn its UpgradeCap. `init` mints the full 1B supply to the launcher and
 *   freezes CoinMetadata + TreasuryCap (the can't-rug set).
 *
 *   PTB 2 — `buildTokenizeTx`: bind the coin type to the Agent ID → split the
 *   supply 50/50 → create the Cetus AGENT/USDC pool seeded with the LP half +
 *   launcher-supplied USDC → wrap the position in a 10-year `LpLock` whose sole
 *   beneficiary is the agent wallet → finalize the registry record. Atomic:
 *   either the agent ends tokenized-with-locked-LP or nothing is recorded.
 *
 * Bind CANNOT live in PTB 1 — a type argument can't name a package being
 * published in the same transaction — so a crashed launch between the PTBs
 * leaves a published-but-unbound coin (launcher's gas, nobody's harm) and
 * PTB 2 is simply retried.
 *
 * The quote side is USDC (L3 override 2026-07-25) — selected from the
 * launcher's own coins, so gas sponsorship is now PERMITTED (sponsor gas can
 * no longer become LP). v1 ships unsponsored; wire the job/register sponsor
 * pattern if SUI-less launchers appear.
 *
 * These builders construct UNSIGNED transactions; auth lives in the Move
 * layer (`registry::bind/finalize` re-check agent-or-confirmed-owner on
 * `ctx.sender()` every call).
 */

/** The published `agent_capital` package id (mainnet, deployed 2026-07-24,
 *  tx `J1dxR72oFhoiZtnwZng9jnDtBev58K9Z8PdPBtMp5eBb`). Env-overridable for
 *  testnet/dev (same pattern as `A2A_ESCROW_PACKAGE_ID`). */
export const AGENT_CAPITAL_PACKAGE_ID =
  process.env.AGENT_CAPITAL_PACKAGE_ID ??
  '0x33a04c672381c1de7178f56221e4ebfc4712675feecc2a0b70c25efbb500fc25';

/** The shared `CapitalRegistry` object id (mainnet). */
export const CAPITAL_REGISTRY_ID =
  process.env.CAPITAL_REGISTRY_ID ??
  '0xd75a72e80c1a5181cc9bb095089cc236e3e20be11b5982ab21e76c54508bd2d7';

/** `initial_shared_version` of the CapitalRegistry — lets builders reference
 *  the shared object without a resolution round-trip. */
export const CAPITAL_REGISTRY_VERSION = Number(
  process.env.CAPITAL_REGISTRY_VERSION ?? 951301211,
);

function assertDeployed(): void {
  if (!AGENT_CAPITAL_PACKAGE_ID || !CAPITAL_REGISTRY_ID) {
    throw new T2000Error(
      'PROTOCOL_UNAVAILABLE',
      'agent_capital is not deployed on this network (set AGENT_CAPITAL_PACKAGE_ID + CAPITAL_REGISTRY_ID)',
    );
  }
}

/** Minimum USDC the launcher must seed the pool with (L3 override 2026-07-25:
 *  the quote side is USDC, the settlement stable — never SUI). Enough that the
 *  pool opens with real two-sided liquidity rather than dust. */
export const MIN_LP_USDC = 5_000_000n; // 5 USDC

const REGISTRY_MODULE = 'registry';
const LP_LOCK_MODULE = 'lp_lock';

export interface PublishAgentCoinArgs {
  /** Coin branding; `recipient` MUST be the launcher (checked). */
  coin: AgentCoinParams;
  /** The wallet signing + funding this launch. */
  launcher: string;
}

export interface PublishAgentCoinResult {
  tx: Transaction;
  /** Module + OTW the published coin type will use:
   *  `<newPkg>::<moduleName>::<otw>`. */
  moduleName: string;
  otw: string;
}

/** PTB 1 — publish the agent coin package, burn upgradability in-tx.
 *  Async: the bytecode-template WASM loads lazily on first use. */
export async function buildPublishAgentCoinTx(
  args: PublishAgentCoinArgs,
): Promise<PublishAgentCoinResult> {
  if (!isValidSuiAddress(args.launcher)) {
    throw new T2000Error('INVALID_ADDRESS', `bad launcher: ${args.launcher}`);
  }
  if (args.coin.recipient !== args.launcher) {
    // The supply must land with the signer of PTB 2 — anything else strands
    // the launch (and a platform recipient would violate no-custody).
    throw new T2000Error(
      'INVALID_INPUT',
      'coin.recipient must equal launcher — the full supply lands with the launch signer, never a third party',
    );
  }
  const mod = await buildAgentCoinModule(args.coin);

  const tx = new Transaction();
  tx.setSender(args.launcher);
  const [upgradeCap] = tx.publish({
    modules: mod.modules,
    dependencies: mod.dependencies,
  });
  tx.moveCall({
    target: '0x2::package::make_immutable',
    arguments: [upgradeCap],
  });
  return { tx, moduleName: mod.moduleName, otw: mod.otw };
}

export interface TokenizeArgs {
  /** The agent being tokenized (Agent ID key — its wallet address). */
  agent: string;
  /** Signer: the agent itself or its CONFIRMED owner. */
  launcher: string;
  /** Published coin type from PTB 1: `<pkg>::<module>::<OTW>`. */
  coinType: string;
  /** The launcher-owned Coin object holding the full 1B supply (from PTB 1). */
  supplyCoinId: string;
  /** The published coin's CoinMetadata object id (frozen, from PTB 1). */
  coinMetadataId: string;
  /** USDC CoinMetadata object id (constant on mainnet, arg for testnet). */
  usdcMetadataId?: string;
  /** Raw USDC (6dp) the launcher seeds the pool with (≥ MIN_LP_USDC) —
   *  selected from the launcher's own coins, never platform funds. */
  lpUsdcAmount: bigint;
  /** Pool display url — the agent icon; optional. */
  poolUrl?: string;
  /** Pair orientation — from `simulate`-then-flip (see cetus-clmm.ts note). */
  usdcFirst?: boolean;
  /** The `agent_id::registry` shared object id. */
  agentRegistryId: string;
  /** Client for USDC coin selection (gRPC). */
  client: SuiCoreClient;
}

/** USDC CoinMetadata on mainnet (immutable, well-known). */
export const USDC_COIN_METADATA_ID =
  '0x75cfbbf8c962d542e99a1d15731e6069f60a00db895407785b15d14f606f2b4a';

/**
 * PTB 2 — bind + split 50/50 + pool + 10y lock + finalize, atomically.
 */
export async function buildTokenizeTx(args: TokenizeArgs): Promise<Transaction> {
  assertDeployed();
  if (!isValidSuiAddress(args.agent)) {
    throw new T2000Error('INVALID_ADDRESS', `bad agent: ${args.agent}`);
  }
  if (!isValidSuiAddress(args.launcher)) {
    throw new T2000Error('INVALID_ADDRESS', `bad launcher: ${args.launcher}`);
  }
  if (args.lpUsdcAmount < MIN_LP_USDC) {
    throw new T2000Error(
      'INVALID_AMOUNT',
      `lpUsdcAmount ${args.lpUsdcAmount} < minimum ${MIN_LP_USDC} raw (5 USDC)`,
    );
  }

  const tx = new Transaction();
  tx.setSender(args.launcher);
  const registryArg = () =>
    tx.sharedObjectRef({
      objectId: CAPITAL_REGISTRY_ID,
      initialSharedVersion: CAPITAL_REGISTRY_VERSION,
      mutable: true,
    });

  // 1. Reserve the agent's one tokenization slot (aborts if taken).
  tx.moveCall({
    target: `${AGENT_CAPITAL_PACKAGE_ID}::${REGISTRY_MODULE}::bind`,
    typeArguments: [args.coinType],
    arguments: [
      registryArg(),
      tx.object(args.agentRegistryId),
      tx.pure.address(args.agent),
      tx.object.clock(),
    ],
  });

  // 2. Split the supply: LP half seeds the pool; treasury half → agent wallet.
  const supplyCoin = tx.object(args.supplyCoinId);
  const [lpCoin] = tx.splitCoins(supplyCoin, [
    tx.pure.u64(AGENT_TOKEN_LP_ALLOCATION),
  ]);
  // (remainder in supplyCoin = AGENT_TOKEN_TREASURY_ALLOCATION)

  // 3. Launcher's USDC for the quote side of the pool — selected from their
  //    own coins (address balance included), never from gas, never platform.
  const { coin: lpUsdc } = await selectAndSplitCoin(
    tx,
    args.client,
    args.launcher,
    USDC_TYPE,
    args.lpUsdcAmount,
  );

  // 4. Create the pool + full-range position. Initial price = the seeded
  //    ratio; fix the AGENT side so exactly 50% of supply enters the pool.
  const usdcFirst = args.usdcFirst ?? false;
  const sqrtPrice = usdcFirst
    ? sqrtPriceX64FromAmounts(args.lpUsdcAmount, AGENT_TOKEN_LP_ALLOCATION)
    : sqrtPriceX64FromAmounts(AGENT_TOKEN_LP_ALLOCATION, args.lpUsdcAmount);
  const usdcMeta = args.usdcMetadataId ?? USDC_COIN_METADATA_ID;
  const poolResult = createPoolV2(tx, {
    coinTypeA: usdcFirst ? USDC_TYPE : args.coinType,
    coinTypeB: usdcFirst ? args.coinType : USDC_TYPE,
    metadataA: usdcFirst ? usdcMeta : args.coinMetadataId,
    metadataB: usdcFirst ? args.coinMetadataId : usdcMeta,
    coinA: usdcFirst ? lpUsdc : lpCoin,
    coinB: usdcFirst ? lpCoin : lpUsdc,
    sqrtPriceX64: sqrtPrice,
    fixAmountA: !usdcFirst, // always fix the AGENT side
    url: args.poolUrl,
  });
  const position = poolResult[0];
  const refundA = poolResult[1];
  const refundB = poolResult[2];

  // 5. Record the pool id off the position, then lock the position for 10y —
  //    fees claimable by anyone, payable only to the agent.
  const poolId = positionPoolId(tx, position);
  const [lockId] = tx.moveCall({
    target: `${AGENT_CAPITAL_PACKAGE_ID}::${LP_LOCK_MODULE}::lock`,
    typeArguments: [CETUS_POSITION_TYPE],
    arguments: [position, tx.pure.address(args.agent), tx.object.clock()],
  });

  // 6. Finalize the registry record in the same atomic tx.
  tx.moveCall({
    target: `${AGENT_CAPITAL_PACKAGE_ID}::${REGISTRY_MODULE}::finalize`,
    typeArguments: [args.coinType],
    arguments: [
      registryArg(),
      tx.object(args.agentRegistryId),
      tx.pure.address(args.agent),
      poolId,
      lockId,
      tx.object.clock(),
    ],
  });

  // 7. Treasury half + any AGENT-side pool refund → the agent wallet;
  //    USDC refund → back to the launcher.
  const agentRefund = usdcFirst ? refundB : refundA;
  const usdcRefund = usdcFirst ? refundA : refundB;
  tx.transferObjects([supplyCoin, agentRefund], tx.pure.address(args.agent));
  tx.transferObjects([usdcRefund], tx.pure.address(args.launcher));

  return tx;
}
