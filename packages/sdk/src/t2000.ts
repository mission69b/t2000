import { EventEmitter } from 'eventemitter3';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, coinWithBalance, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { createPaymentTransactionUri } from '@mysten/payment-kit';
import { getSuiClient, getSuiGrpcClient } from './utils/sui.js';
import {
  generateKeypair,
  keypairFromPrivateKey,
  saveKey,
  loadKey,
  walletExists,
  exportPrivateKey,
  getAddress,
} from './wallet/keyManager.js';
import type { TransactionSigner } from './signer.js';
import { KeypairSigner } from './wallet/keypairSigner.js';
import { ZkLoginSigner, type ZkLoginProof } from './wallet/zkLoginSigner.js';
import { buildSendTx } from './wallet/send.js';
import { queryBalance } from './wallet/balance.js';
import { queryHistory, queryTransaction } from './wallet/history.js';
import { getDecimalsForCoinType, resolveSymbol } from './token-registry.js';
import {
  SUI_ADDRESS_REGEX,
  SuinsNotRegisteredError,
  looksLikeSuiNs,
  resolveSuinsViaRpc,
} from './utils/suins.js';
// [B5 v2 / 2026-04-30] No fee imports — CLI / direct SDK is fee-free. Consumer
// apps (Audric) own fee policy via `addFeeTransfer` from `./protocols/protocolFee.js`.
import * as yieldTracker from './protocols/yieldTracker.js';
import { ProtocolRegistry } from './adapters/registry.js';
import { NaviAdapter } from './adapters/navi.js';
import type { LendingAdapter } from './adapters/types.js';
import type {
  T2000Options,
  BalanceResponse,
  SendResult,
  SaveResult,
  WithdrawResult,
  BorrowResult,
  RepayResult,
  HealthFactorResult,
  MaxWithdrawResult,
  MaxBorrowResult,
  RatesResult,
  PositionsResult,
  TransactionRecord,
  DepositInfo,
  PaymentRequest,
  EarningsResult,
  FundStatusResult,
  ClaimRewardsResult,
  CompoundRewardsResult,
  PendingReward,
  PayOptions,
  PayResult,
  SwapResult,
  SwapQuoteResult,
} from './types.js';
import { T2000Error } from './errors.js';
import { SUPPORTED_ASSETS, assertAllowedAsset, type SendableAsset, type SupportedAsset } from './constants.js';

import { truncateAddress } from './utils/sui.js';
import { SafeguardEnforcer } from './safeguards/enforcer.js';
import { ContactManager } from './contacts.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CONFIG_DIR = join(homedir(), '.t2000');

interface T2000Events {
  balanceChange: (event: { asset: string; previous: number; current: number; cause: string; tx?: string }) => void;
  healthWarning: (event: { healthFactor: number; threshold: number; severity: 'warning' }) => void;
  healthCritical: (event: { healthFactor: number; threshold: number; severity: 'critical' }) => void;
  yield: (event: { earned: number; total: number; apy: number; timestamp: number }) => void;
  error: (error: T2000Error) => void;
}

// Sign + execute a transaction with the agent's signer. Replaces the pre-v2 gas
// manager — every transaction is now self-funded by the agent's wallet.
type SuiTransactionEffects = NonNullable<Awaited<ReturnType<SuiJsonRpcClient['executeTransactionBlock']>>['effects']>;

type BuildClient = NonNullable<Parameters<Transaction['build']>[0]>['client'];

async function executeTx(
  client: SuiJsonRpcClient,
  signer: TransactionSigner,
  buildTx: () => Promise<Transaction> | Transaction,
  options: { buildClient?: BuildClient } = {},
): Promise<{ digest: string; gasCostSui: number; effects: SuiTransactionEffects | undefined }> {
  const tx = await buildTx();
  tx.setSender(signer.getAddress());
  // [2026-05-22] Optional buildClient. When set, `tx.build()` uses it to
  // resolve the PTB — relevant for gasless stablecoin transfers where the
  // SuiGrpcClient build path auto-detects allowlisted ops and zeros out
  // gasPrice/gasBudget/gasPayment. See `T2000.pay()`. Submission still
  // goes through the JSON-RPC client (gRPC client's submit API is not
  // drop-in compatible with the rest of the SDK).
  const txBytes = await tx.build({ client: options.buildClient ?? client });
  const { signature } = await signer.signTransaction(txBytes);
  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  const gasUsed = result.effects?.gasUsed;
  let gasCostSui = 0;
  if (gasUsed) {
    const total = BigInt(gasUsed.computationCost) + BigInt(gasUsed.storageCost) - BigInt(gasUsed.storageRebate);
    gasCostSui = Number(total) / 1e9;
  }
  return { digest: result.digest, gasCostSui, effects: result.effects ?? undefined };
}

export class T2000 extends EventEmitter<T2000Events> {
  private readonly _signer: TransactionSigner;
  private readonly _keypair?: Ed25519Keypair;
  private readonly client: SuiJsonRpcClient;
  private readonly _address: string;
  private readonly registry: ProtocolRegistry;
  readonly enforcer: SafeguardEnforcer;
  readonly contacts: ContactManager;

  private constructor(keypair: Ed25519Keypair, client: SuiJsonRpcClient, registry?: ProtocolRegistry, configDir?: string);
  private constructor(signer: TransactionSigner, client: SuiJsonRpcClient, registry: ProtocolRegistry | undefined, configDir: string | undefined, isSignerMode: true);
  private constructor(
    keypairOrSigner: Ed25519Keypair | TransactionSigner,
    client: SuiJsonRpcClient,
    registry?: ProtocolRegistry,
    configDir?: string,
    isSignerMode?: boolean,
  ) {
    super();
    if (isSignerMode) {
      this._signer = keypairOrSigner as TransactionSigner;
      this._keypair = undefined;
      this._address = this._signer.getAddress();
    } else {
      const kp = keypairOrSigner as Ed25519Keypair;
      this._keypair = kp;
      this._signer = new KeypairSigner(kp);
      this._address = getAddress(kp);
    }
    this.client = client;
    this.registry = registry ?? T2000.createDefaultRegistry(client);
    this.enforcer = new SafeguardEnforcer(configDir);
    this.enforcer.load();
    this.contacts = new ContactManager(configDir);
  }

  private static createDefaultRegistry(client: SuiJsonRpcClient): ProtocolRegistry {
    const registry = new ProtocolRegistry();
    const naviAdapter = new NaviAdapter();
    naviAdapter.initSync(client);
    registry.registerLending(naviAdapter);
    return registry;
  }

  static async create(options: T2000Options = {}): Promise<T2000> {
    const { keyPath, rpcUrl } = options;

    const client = getSuiClient(rpcUrl);

    const exists = await walletExists(keyPath);
    if (!exists) {
      throw new T2000Error(
        'WALLET_NOT_FOUND',
        'No wallet found. Run `t2 init` to create one.',
      );
    }

    // [v4.0] loadKey reads v2 plain Bech32 JSON. Anything else throws
    // WALLET_CORRUPT. PIN/passphrase fields on T2000Options are accepted
    // for back-compat but IGNORED.
    const keypair = await loadKey(undefined, keyPath);
    return new T2000(keypair, client, undefined, DEFAULT_CONFIG_DIR);
  }

  static fromPrivateKey(privateKey: string, options: { network?: 'mainnet' | 'testnet'; rpcUrl?: string } = {}): T2000 {
    const keypair = keypairFromPrivateKey(privateKey);
    const client = getSuiClient(options.rpcUrl);
    return new T2000(keypair, client);
  }

  static async init(options: { pin?: string; passphrase?: string; keyPath?: string; name?: string } = {}): Promise<{ agent: T2000; address: string }> {
    // [v4.0] pin/passphrase accepted for back-compat but IGNORED.
    const keypair = generateKeypair();
    await saveKey(keypair, undefined, options.keyPath);

    const client = getSuiClient();
    const agent = new T2000(keypair, client, undefined, DEFAULT_CONFIG_DIR);
    const address = agent.address();

    return { agent, address };
  }

  // -- Gas --

  /** SuiJsonRpcClient used by this agent — exposed for integrations. */
  get suiClient(): SuiJsonRpcClient {
    return this.client;
  }

  /** Ed25519Keypair used by this agent — exposed for CLI/MCP integrations. */
  get keypair(): Ed25519Keypair {
    if (!this._keypair) {
      throw new T2000Error('WALLET_NOT_FOUND', 'Keypair not available — this instance uses zkLogin');
    }
    return this._keypair;
  }

  /** Transaction signer (works for both keypair and zkLogin). */
  get signer(): TransactionSigner {
    return this._signer;
  }

  // -- MPP Payments --

  async pay(options: PayOptions): Promise<PayResult> {
    this.enforcer.assertNotLocked();
    this.enforcer.check({ operation: 'pay', amount: options.maxPrice ?? 1.0 });

    const { Mppx } = await import('mppx/client');
    const { sui, USDC } = await import('@suimpp/mpp/client');
    const { SuiGrpcClient } = await import('@mysten/sui/grpc');

    const client = this.client;
    const signer = this._signer;
    const signerAddress = signer.getAddress();

    let paymentDigest: string | undefined;
    let gasCostSui = 0;

    // [2026-05-22] Gasless MPP. Build the payment PTB via SuiGrpcClient
    // so the SDK's gasless-eligibility resolver runs at build time. When
    // the PTB is `0x2::balance::send_funds` on an allowlisted stablecoin
    // (USDC, USDsui, USDY, FdUSD, AUSD, BUCK, USDB, SUI_USDE), the resolver
    // sets `gasPrice=0, gasBudget=0, gasPayment=[]` automatically. The
    // protocol then accepts the tx for $0 gas.
    //
    // Submission stays on JSON-RPC because (a) the rest of the SDK expects
    // SuiJsonRpcClient and (b) the docs explicitly support a "build via
    // gRPC, execute via JSON-RPC" hybrid:
    // https://docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers
    //
    // Network selection: only mainnet + testnet are gasless-eligible
    // surfaces. Devnet/localnet/custom RPC fall back to mainnet — the
    // tx will still build, just without the gasless allowlist check
    // (which is mainnet-protocol-config-driven anyway).
    const network: 'mainnet' | 'testnet' = client.network === 'testnet' ? 'testnet' : 'mainnet';
    const grpcBaseUrl =
      network === 'testnet'
        ? 'https://fullnode.testnet.sui.io'
        : 'https://fullnode.mainnet.sui.io';
    const grpcClient = new SuiGrpcClient({ baseUrl: grpcBaseUrl, network });

    const mppx = Mppx.create({
      polyfill: false,
      methods: [sui({
        client,
        currency: USDC,
        signer: {
          toSuiAddress: () => signerAddress,
          signPersonalMessage: (bytes: Uint8Array) => signer.signPersonalMessage(bytes),
        } as Parameters<typeof sui>[0]['signer'],
        execute: async (tx) => {
          const result = await executeTx(client, signer, () => tx, { buildClient: grpcClient });
          paymentDigest = result.digest;
          gasCostSui = result.gasCostSui;
          return { digest: result.digest };
        },
      })],
    });

    const method = (options.method ?? 'GET').toUpperCase();
    const canHaveBody = method !== 'GET' && method !== 'HEAD';

    const response = await mppx.fetch(options.url, {
      method,
      headers: options.headers,
      body: canHaveBody ? options.body : undefined,
    });

    const contentType = response.headers.get('content-type') ?? '';
    let body: unknown;
    try {
      body = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
    } catch {
      body = null;
    }

    const paid = !!paymentDigest;

    if (paid) {
      this.enforcer.recordUsage(options.maxPrice ?? 1.0);
    }

    return {
      status: response.status,
      body,
      paid,
      cost: paid ? (options.maxPrice ?? undefined) : undefined,
      gasCostSui: paid ? gasCostSui : undefined,
      receipt: paymentDigest
        ? { reference: paymentDigest, timestamp: new Date().toISOString() }
        : undefined,
    };
  }

  // [S.323 / 2026-05-25] VOLO vSUI staking surfaces removed (full cut).
  // Engine cut Volo in S.277; SDK + CLI + MCP followed in S.323 because the
  // product surface (five products: Passport / Intelligence / Finance / Pay
  // / Store) doesn't include a staking primitive. vSUI still appears in the
  // codebase as a passive token (NAVI reward rewards, Cetus swap routing),
  // but there is no longer any way to MINT or REDEEM vSUI through t2000.
  // History: see spec/archive/v07e/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md
  // and the S.323 build-tracker entry.

  // -- Swap --

  async swap(params: {
    from: string;
    to: string;
    amount: number;
    byAmountIn?: boolean;
    slippage?: number;
  }): Promise<SwapResult> {
    this.enforcer.assertNotLocked();

    const { findSwapRoute, buildSwapTx, resolveTokenType } = await import('./protocols/cetus-swap.js');

    const fromType = resolveTokenType(params.from);
    const toType = resolveTokenType(params.to);
    if (!fromType) throw new T2000Error('ASSET_NOT_SUPPORTED', `Unknown token: ${params.from}. Provide the full coin type.`);
    if (!toType) throw new T2000Error('ASSET_NOT_SUPPORTED', `Unknown token: ${params.to}. Provide the full coin type.`);

    const byAmountIn = params.byAmountIn ?? true;
    const slippage = Math.min(params.slippage ?? 0.01, 0.05);

    const fromDecimals = getDecimalsForCoinType(fromType);
    const rawAmount = BigInt(Math.floor(params.amount * 10 ** fromDecimals));

    const route = await findSwapRoute({
      walletAddress: this._address,
      from: fromType,
      to: toType,
      amount: rawAmount,
      byAmountIn,
    });

    if (!route) throw new T2000Error('SWAP_NO_ROUTE', `No swap route found for ${params.from} -> ${params.to}.`);
    if (route.insufficientLiquidity) throw new T2000Error('SWAP_NO_ROUTE', `Insufficient liquidity for ${params.from} -> ${params.to}.`);
    if (route.priceImpact > 0.05) {
      console.warn(`[swap] High price impact: ${(route.priceImpact * 100).toFixed(2)}%`);
    }

    const toDecimals = getDecimalsForCoinType(toType);

    // Snapshot pre-swap balance for fallback diff calculation
    let preBalRaw = 0n;
    try {
      const preBal = await this.client.getBalance({ owner: this._address, coinType: toType });
      preBalRaw = BigInt(preBal.totalBalance);
    } catch { /* first time holding this token — balance is 0 */ }

    const gasResult = await executeTx(this.client, this._signer, async () => {
      const tx = new Transaction();
      tx.setSender(this._address);

      let inputCoin: TransactionObjectArgument;
      if (fromType === '0x2::sui::SUI') {
        [inputCoin] = tx.splitCoins(tx.gas, [rawAmount]);
      } else {
        const bal = await this.client.getBalance({ owner: this._address, coinType: fromType });
        if (BigInt(bal.totalBalance) < rawAmount) {
          throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${params.from} balance.`, {
            available: Number(bal.totalBalance) / 10 ** fromDecimals,
            required: params.amount,
          });
        }
        inputCoin = coinWithBalance({ type: fromType, balance: rawAmount })(tx);
      }

      const outputCoin = await buildSwapTx({
        walletAddress: this._address,
        route,
        tx,
        inputCoin,
        slippage,
      });

      tx.transferObjects([outputCoin], this._address);
      return tx;
    });

    const fromAmount = Number(route.amountIn) / 10 ** fromDecimals;
    let toAmount = Number(route.amountOut) / 10 ** toDecimals;

    // --- Primary: parse balance changes from the finalized transaction ---
    const toTypeSuffix = toType.split('::').slice(1).join('::');
    try {
      const fullTx = await this.client.waitForTransaction({
        digest: gasResult.digest,
        options: { showBalanceChanges: true },
        timeout: 8_000,
        pollInterval: 400,
      });
      type BalChange = { coinType: string; amount: string; owner: { AddressOwner?: string } };
      const changes = ((fullTx as { balanceChanges?: BalChange[] }).balanceChanges ?? []);
      const received = changes.find((c) => {
        if (BigInt(c.amount) <= 0n) return false;
        const ownerAddr = (c.owner as { AddressOwner?: string })?.AddressOwner;
        if (!ownerAddr || ownerAddr.toLowerCase() !== this._address.toLowerCase()) return false;
        if (c.coinType === toType) return true;
        return c.coinType.endsWith(toTypeSuffix);
      });
      if (received) {
        const actual = Number(BigInt(received.amount)) / 10 ** toDecimals;
        if (actual > 0) toAmount = actual;
      }
    } catch {
      // waitForTransaction timeout — fall through to balance diff
    }

    // --- Fallback: pre/post getBalance diff ---
    const cetusEstimate = Number(route.amountOut) / 10 ** toDecimals;
    if (Math.abs(toAmount - cetusEstimate) < 0.001) {
      try {
        await new Promise((r) => setTimeout(r, 2000));
        const postBal = await this.client.getBalance({ owner: this._address, coinType: toType });
        const postRaw = BigInt(postBal.totalBalance);
        const delta = Number(postRaw - preBalRaw) / 10 ** toDecimals;
        if (delta > 0) toAmount = delta;
      } catch {
        // Balance diff fallback failed — use Cetus estimate
      }
    }

    // Resolve full coin types to user-friendly token names
    const fromName = resolveSymbol(fromType);
    const toName = resolveSymbol(toType);

    const routeDesc = route.routerData.paths
      ?.map((p) => p.provider)
      .filter(Boolean)
      .slice(0, 3)
      .join(' + ') ?? 'Cetus Aggregator';

    return {
      success: true,
      tx: gasResult.digest,
      fromToken: fromName,
      toToken: toName,
      fromAmount,
      toAmount,
      priceImpact: route.priceImpact,
      route: routeDesc,
      gasCost: gasResult.gasCostSui,
    };
  }

  /**
   * [SPEC_AGENTIC_STACK P1 / SDK F2 — 2026-05-25]
   * Thin wrapper around the standalone `getSwapQuote()`. Pre-Phase 1 this method
   * was ~50 LoC duplicating `swap-quote.ts` — missing `serializedRoute` (SPEC 20.2
   * fast-path) and the `providers` allow-list (Bug A fix / Pyth-dependent
   * provider filter for sponsored callers). Routing both API surfaces through
   * one implementation ensures fixes land for both.
   */
  async swapQuote(params: {
    from: string;
    to: string;
    amount: number;
    byAmountIn?: boolean;
    providers?: string[];
  }): Promise<SwapQuoteResult> {
    const { getSwapQuote } = await import('./swap-quote.js');
    return getSwapQuote({
      walletAddress: this._address,
      from: params.from,
      to: params.to,
      amount: params.amount,
      byAmountIn: params.byAmountIn,
      providers: params.providers,
    });
  }

  // -- Wallet --

  address(): string {
    return this._address;
  }

  /**
   * Send `amount` of `asset` to `to` (hex address, SuiNS name, or
   * `@audric` handle / saved contact).
   *
   * [v4.0 Phase A Day 2 — SPEC_AGENT_WALLET_GREENFIELD §A]
   *
   * **Breaking changes from v3.x:**
   * - `asset` is now REQUIRED (no implicit `?? 'USDC'` default). Callers
   *   must specify `'USDC' | 'USDsui' | 'SUI'`. Sending `'USDT'` /
   *   `'USDe'` / `'WAL'` / `'ETH'` / `'NAVX'` / `'GOLD'` now errors
   *   with `INVALID_ASSET` — swap to a stable first.
   * - USDC + USDsui builds go through `SuiGrpcClient` so the gRPC build
   *   resolver auto-detects `0x2::balance::send_funds` eligibility and
   *   zeros gas at simulate time. Result: **gasless USDC / USDsui sends
   *   from a zero-SUI wallet.** SUI sends stay on the standard gas-paid
   *   path.
   *
   * Submission stays on the JSON-RPC client (the rest of the SDK
   * expects JSON-RPC for read paths, and Sui's docs explicitly support
   * the "build via gRPC, execute via JSON-RPC" hybrid).
   */
  async send(params: { to: string; amount: number; asset: SupportedAsset }): Promise<SendResult> {
    this.enforcer.assertNotLocked();

    // [v4.0 Phase A Day 2] Asset is REQUIRED at runtime (no more silent
    // USDC default). The parameter type is `SupportedAsset` (the wider
    // SDK surface) rather than `SendableAsset` so callers that still
    // hand a wide-typed asset through — primarily the engine LLM tool
    // surface — compile without modification. Runtime narrowing happens
    // via `assertAllowedAsset('send', asset)`, which throws
    // `INVALID_ASSET` for anything outside `['USDC', 'USDsui', 'SUI']`.
    // This matches the SPEC verification gate `asset: 'USDY'` →
    // `INVALID_ASSET` (runtime check, not compile check).
    const asset = params.asset;
    if (!asset) {
      throw new T2000Error(
        'INVALID_ASSET',
        "send() requires an explicit asset. Use one of: USDC, USDsui, SUI.",
      );
    }
    assertAllowedAsset('send', asset);
    // `assertAllowedAsset('send', asset)` narrows the runtime value to
    // one of `SendableAsset` (USDC / USDsui / SUI). Cast statically.
    const sendableAsset = asset as SendableAsset;

    const resolved = await this.resolveRecipient(params.to);
    const sendAmount = params.amount;
    const sendTo = resolved.address;

    // [v4.0 Phase A Day 2] Build path picks gRPC for the two
    // gasless-eligible stables (USDC / USDsui) so the resolver can
    // zero gas at simulate. SUI uses the JSON-RPC build path because
    // SUI is not on the protocol allowlist for `balance::send_funds`
    // — there's no upside to gRPC for SUI, and the JSON-RPC singleton
    // is already initialised (one fewer cold-start cost).
    const useGrpc = sendableAsset === 'USDC' || sendableAsset === 'USDsui';
    const buildClient = useGrpc ? getSuiGrpcClient() : undefined;

    const gasResult = await executeTx(
      this.client,
      this._signer,
      () => buildSendTx({ client: this.client, address: this._address, to: sendTo, amount: sendAmount, asset: sendableAsset }),
      { buildClient },
    );

    this.enforcer.recordUsage(sendAmount);
    const balance = await this.balance();

    this.emitBalanceChange(sendableAsset, sendAmount, 'send', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: sendAmount,
      to: resolved.address,
      contactName: resolved.contactName,
      suinsName: resolved.suinsName,
      gasCost: gasResult.gasCostSui,
      gasCostUnit: 'SUI',
      balance,
    };
  }

  /**
   * [S.279 / CLI-CONTACTS-CLEANUP — 2026-05-23] Resolve a recipient
   * string into a canonical 0x address, trying each shape in priority
   * order:
   *   1. **hex** — `0x…` is used directly (no RPC round-trip).
   *   2. **SuiNS** — `alex.sui` resolves via `suix_resolveNameServiceAddress`.
   *   3. **saved contact** — `ContactManager.resolve()` falls back to the
   *      legacy `~/.t2000/contacts.json` alias map. Deprecated; the
   *      manager surfaces a one-time `console.warn` when this path fires.
   *
   * Returns `{ address, suinsName?, contactName? }` so `send()` can stamp
   * the name source on the receipt without re-resolving.
   *
   * Throws `T2000Error('SUINS_NOT_REGISTERED', …)` for well-formed but
   * unregistered SuiNS names (vs. propagating the engine-style
   * `SuinsNotRegisteredError` — keeps the SDK's error surface
   * `T2000Error`-only, consistent with every other write helper).
   *
   * [S.279.1 / 2026-05-23 — patch v2.19.1] Promoted from `private` to
   * `public` so MCP's `t2000_send` dryRun preview path can share the
   * same resolution logic as the live execute path. Pre-2.19.1 the
   * MCP dryRun called `agent.contacts.resolve(to)` directly, which
   * rejected SuiNS names — preview-then-execute flows broke for
   * `alex.sui`-style recipients. SSOT: never let preview and execute
   * resolve the same input differently.
   */
  async resolveRecipient(
    input: string,
  ): Promise<{ address: string; contactName?: string; suinsName?: string }> {
    const trimmed = input.trim();
    if (SUI_ADDRESS_REGEX.test(trimmed)) {
      // Path 1 — already a hex address. ContactManager.resolve also
      // accepts hex, but routing through it adds a disk read for nothing.
      return { address: trimmed.toLowerCase() };
    }
    if (looksLikeSuiNs(trimmed)) {
      // Path 2 — SuiNS lookup. Falls through to ContactManager only if
      // the name is well-formed but unregistered AND the user happens
      // to have a contact alias with the exact same string (vanishingly
      // rare — `.sui` suffixes are reserved-looking).
      try {
        const name = trimmed.toLowerCase();
        const address = await resolveSuinsViaRpc(name);
        if (!address) {
          throw new SuinsNotRegisteredError(name);
        }
        return { address: address.toLowerCase(), suinsName: name };
      } catch (err) {
        if (err instanceof SuinsNotRegisteredError) {
          throw new T2000Error(
            'SUINS_NOT_REGISTERED',
            err.message,
          );
        }
        throw err;
      }
    }
    // Path 3 — saved contact alias (deprecated; ContactManager warns).
    return this.contacts.resolve(input);
  }

  async balance(): Promise<BalanceResponse> {
    const bal = await queryBalance(this.client, this._address);

    let chainTotal = bal.available + bal.gasReserve.usdEquiv;

    try {
      const positions = await this.positions();
      for (const pos of positions.positions) {
        const usdValue = pos.amountUsd ?? pos.amount;
        if (pos.type === 'save') {
          chainTotal += usdValue;
          bal.savings += usdValue;
        } else if (pos.type === 'borrow') {
          chainTotal -= usdValue;
          bal.debt += usdValue;
        }
      }
    } catch {
      // Protocol unavailable — chain total limited to wallet
    }

    try {
      const pendingRewards = await this.getPendingRewards();
      bal.pendingRewards = pendingRewards.reduce((s, r) => s + r.estimatedValueUsd, 0);
    } catch {
      bal.pendingRewards = 0;
    }

    bal.total = chainTotal;
    return bal;
  }

  async history(params?: { limit?: number }): Promise<TransactionRecord[]> {
    return queryHistory(this.client, this._address, params?.limit);
  }

  async transactionDetail(digest: string): Promise<TransactionRecord | null> {
    return queryTransaction(this.client, digest, this._address);
  }

  async deposit(): Promise<DepositInfo> {
    return {
      address: this._address,
      network: 'mainnet',
      supportedAssets: ['USDC', 'USDT', 'SUI'],
      instructions: [
        `Send USDC to: ${this._address}`,
        `Network: Sui Mainnet`,
        `Or buy USDC on an exchange and withdraw to this address.`,
        `USDC contract: ${SUPPORTED_ASSETS.USDC.type}`,
      ].join('\n'),
    };
  }

  /**
   * [SPEC_AGENTIC_STACK P1 / SDK F2 — 2026-05-25; refreshed S.342 / 2026-05-26]
   * Preferred alias of `deposit()`. Was introduced to mirror the v3 `t2000 fund`
   * CLI command; the v4 CLI surface is `t2 receive` (deleted `fund` in the
   * S.332 bulk cut). `deposit()` stays as the canonical method name for
   * back-compat; `fund()` stays as a programmatic alias for audric + other
   * SDK consumers that prefer the verb.
   */
  async fund(): Promise<DepositInfo> {
    return this.deposit();
  }

  receive(params?: { amount?: number; currency?: string; memo?: string; label?: string }): PaymentRequest {
    const amount = params?.amount ?? null;
    const currency = params?.currency ?? 'USDC';
    const memo = params?.memo ?? null;
    const label = params?.label ?? null;
    const nonce = crypto.randomUUID();

    let qrUri: string;
    if (amount != null && amount > 0) {
      const decimals = currency === 'SUI' ? 9 : 6;
      const coinType = currency === 'SUI'
        ? '0x2::sui::SUI'
        : SUPPORTED_ASSETS.USDC.type;
      const rawAmount = BigInt(Math.floor(amount * 10 ** decimals));
      qrUri = createPaymentTransactionUri({
        receiverAddress: this._address,
        amount: rawAmount,
        coinType,
        nonce,
        ...(label ? { label } : {}),
        ...(memo ? { message: memo } : {}),
      });
    } else {
      const qrParts = [`sui:${this._address}`];
      const queryParams: string[] = [];
      if (currency !== 'SUI') queryParams.push(`currency=${currency}`);
      if (memo) queryParams.push(`memo=${encodeURIComponent(memo)}`);
      if (label) queryParams.push(`label=${encodeURIComponent(label)}`);
      qrUri = queryParams.length > 0 ? `${qrParts[0]}?${queryParams.join('&')}` : qrParts[0];
    }

    const amountStr = amount != null ? `$${amount.toFixed(2)} ` : '';
    const displayParts = [`Send ${amountStr}${currency} to ${truncateAddress(this._address)}`];
    if (memo) displayParts.push(`Memo: ${memo}`);

    return {
      address: this._address,
      network: 'mainnet',
      amount,
      currency,
      memo,
      label,
      nonce,
      qrUri,
      displayText: displayParts.join('\n'),
    };
  }

  exportKey(): string {
    return exportPrivateKey(this.keypair);
  }

  static fromZkLogin(opts: {
    ephemeralKeypair: Ed25519Keypair;
    zkProof: ZkLoginProof;
    userAddress: string;
    maxEpoch: number;
    rpcUrl?: string;
  }): T2000 {
    const signer = new ZkLoginSigner(opts.ephemeralKeypair, opts.zkProof, opts.userAddress, opts.maxEpoch);
    const client = getSuiClient(opts.rpcUrl);
    return new T2000(signer, client, undefined, undefined, true);
  }

  async registerAdapter(adapter: LendingAdapter): Promise<void> {
    await adapter.init(this.client);
    this.registry.registerLending(adapter);
  }

  // -- Savings --

  async save(params: { amount: number | 'all'; asset?: SupportedAsset; protocol?: string }): Promise<SaveResult> {
    this.enforcer.assertNotLocked();
    assertAllowedAsset('save', params.asset);
    // [v0.51.0] Default USDC, but honor params.asset for the strategic-exception
    // set (currently USDC, USDsui — see OPERATION_ASSETS.save). Hardcoding 'USDC'
    // here previously silently rewrote the user's intent.
    const asset: SupportedAsset = (params.asset as SupportedAsset | undefined) ?? 'USDC';
    const assetInfo = SUPPORTED_ASSETS[asset];

    let amount: number;
    if (params.amount === 'all') {
      // [v0.51.0] Per-asset balance query — `queryBalance.available` is the sum
      // of STABLE_ASSETS (USDC), not the requested asset. For USDsui we need the
      // raw on-chain balance for that specific coin type.
      const assetBalance = await this._queryAssetBalance(assetInfo.type, assetInfo.decimals);
      amount = assetBalance - 1.0;
      if (amount <= 0) {
        throw new T2000Error('INSUFFICIENT_BALANCE', `No ${assetInfo.displayName} available to save`, {
          reason: 'insufficient_balance', asset,
        });
      }
    } else {
      amount = params.amount;
      const assetBalance = await this._queryAssetBalance(assetInfo.type, assetInfo.decimals);
      if (amount > assetBalance) {
        throw new T2000Error(
          'INSUFFICIENT_BALANCE',
          `Insufficient ${assetInfo.displayName} balance. Available: ${assetBalance.toFixed(assetInfo.decimals === 6 ? 2 : 4)}, requested: ${amount.toFixed(assetInfo.decimals === 6 ? 2 : 4)}`,
        );
      }
    }

    // [B5 v2 / 2026-04-30] CLI / direct SDK calls are fee-free. Consumer apps
    // (Audric) charge their own fees by adding `addFeeTransfer` to the tx before
    // calling the SDK builders. `fee` is reported as 0 in the result.
    const saveAmount = amount;
    const adapter = await this.resolveLending(params.protocol, asset, 'save');
    const canPTB = !!adapter.addSaveToTx;

    const gasResult = await executeTx(this.client, this._signer, async () => {
      if (canPTB) {
        const tx = new Transaction();
        tx.setSender(this._address);

        const rawAmount = BigInt(Math.floor(saveAmount * 10 ** assetInfo.decimals));
        const bal = await this.client.getBalance({ owner: this._address, coinType: assetInfo.type });
        if (BigInt(bal.totalBalance) < rawAmount) {
          throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${assetInfo.displayName} balance`, {
            available: Number(bal.totalBalance) / 10 ** assetInfo.decimals,
            required: saveAmount,
          });
        }
        const inputCoin = coinWithBalance({ type: assetInfo.type, balance: rawAmount })(tx);

        await adapter.addSaveToTx!(tx, this._address, inputCoin, asset);
        return tx;
      }

      const { tx } = await adapter.buildSaveTx(this._address, saveAmount, asset);
      return tx;
    });

    const rates = await adapter.getRates(asset);
    this.emitBalanceChange(asset, saveAmount, 'save', gasResult.digest);

    let savingsBalance = saveAmount;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const positions = await this.positions();
        const actual = positions.positions
          .filter((p) => p.type === 'save' && p.asset === asset)
          .reduce((sum, p) => sum + p.amount, 0);
        if (actual > 0) {
          savingsBalance = actual;
          break;
        }
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 2000));
    }

    return {
      success: true,
      tx: gasResult.digest,
      amount: saveAmount,
      apy: rates.saveApy,
      fee: 0,
      gasCost: gasResult.gasCostSui,
      savingsBalance,
    };
  }

  async withdraw(params: { amount: number | 'all'; asset?: string; protocol?: string }): Promise<WithdrawResult> {
    this.enforcer.assertNotLocked();
    if (params.amount === 'all' && !params.protocol && !params.asset) {
      return this.withdrawAllProtocols();
    }

    const allPositions = await this.registry.allPositions(this._address);
    const supplies: Array<{ protocolId: string; asset: string; amount: number; apy: number }> = [];
    for (const pos of allPositions) {
      if (params.protocol && pos.protocolId !== params.protocol) continue;
      for (const s of pos.positions.supplies) {
        if (s.amount > 0.001) {
          if (params.asset && s.asset !== params.asset) continue;
          supplies.push({ protocolId: pos.protocolId, asset: s.asset, amount: s.amount, apy: s.apy });
        }
      }
    }

    if (supplies.length === 0) {
      throw new T2000Error('NO_COLLATERAL', params.asset ? `No ${params.asset} savings to withdraw` : 'No savings to withdraw');
    }

    supplies.sort((a, b) => {
      const aIsUsdc = a.asset === 'USDC' ? 0 : 1;
      const bIsUsdc = b.asset === 'USDC' ? 0 : 1;
      if (aIsUsdc !== bIsUsdc) return aIsUsdc - bIsUsdc;
      return a.apy - b.apy;
    });
    const target = supplies[0]!;
    const adapter = this.registry.getLending(target.protocolId);
    if (!adapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', `Protocol ${target.protocolId} not found`);

    let amount: number;
    if (params.amount === 'all') {
      const maxResult = await adapter.maxWithdraw(this._address, target.asset);
      amount = maxResult.maxAmount;
      if (amount <= 0) {
        throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw');
      }
    } else {
      amount = params.amount;

      const hf = await adapter.getHealth(this._address);
      if (hf.borrowed > 0) {
        const maxResult = await adapter.maxWithdraw(this._address, target.asset);
        if (amount > maxResult.maxAmount) {
          throw new T2000Error(
            'WITHDRAW_WOULD_LIQUIDATE',
            `Withdrawing $${amount.toFixed(2)} would drop health factor below 1.5`,
            {
              safeWithdrawAmount: maxResult.maxAmount,
              currentHF: maxResult.currentHF,
              projectedHF: maxResult.healthFactorAfter,
            },
          );
        }
      }
    }

    const withdrawAmount = amount;
    let finalAmount = withdrawAmount;

    const gasResult = await executeTx(this.client, this._signer, async () => {
      if (adapter.addWithdrawToTx) {
        const tx = new Transaction();
        tx.setSender(this._address);

        const { coin, effectiveAmount } = await adapter.addWithdrawToTx!(tx, this._address, withdrawAmount, target.asset);
        finalAmount = effectiveAmount;
        tx.transferObjects([coin], this._address);
        return tx;
      }

      const built = await adapter.buildWithdrawTx(this._address, withdrawAmount, target.asset);
      finalAmount = built.effectiveAmount;
      return built.tx;
    });

    this.emitBalanceChange(target.asset, finalAmount, 'withdraw', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: finalAmount,
      asset: target.asset,
      gasCost: gasResult.gasCostSui,
    };
  }

  private async withdrawAllProtocols(): Promise<WithdrawResult> {
    const allPositions = await this.registry.allPositions(this._address);

    const withdrawable: Array<{ protocolId: string; asset: string; amount: number }> = [];
    for (const pos of allPositions) {
      for (const supply of pos.positions.supplies) {
        if (supply.amount > 0.01) {
          withdrawable.push({ protocolId: pos.protocolId, asset: supply.asset, amount: supply.amount });
        }
      }
    }

    if (withdrawable.length === 0) {
      throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw across any protocol');
    }

    const protocolMaxes = new Map<string, number>();
    const entries: Array<{ protocolId: string; asset: string; maxAmount: number; adapter: LendingAdapter }> = [];
    for (const entry of withdrawable) {
      const adapter = this.registry.getLending(entry.protocolId);
      if (!adapter) continue;
      if (!protocolMaxes.has(entry.protocolId)) {
        const maxResult = await adapter.maxWithdraw(this._address, entry.asset);
        protocolMaxes.set(entry.protocolId, maxResult.maxAmount);
      }
      const remaining = protocolMaxes.get(entry.protocolId)!;
      const perAssetMax = Math.min(entry.amount, remaining);
      if (perAssetMax > 0.01) {
        entries.push({ ...entry, maxAmount: perAssetMax, adapter });
        protocolMaxes.set(entry.protocolId, remaining - perAssetMax);
      }
    }

    if (entries.length === 0) {
      throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw across any protocol');
    }

    let totalReceived = 0;
    const canPTB = entries.every(e => e.adapter.addWithdrawToTx);

    const gasResult = await executeTx(this.client, this._signer, async () => {
      if (canPTB) {
        const tx = new Transaction();
        tx.setSender(this._address);

        for (const entry of entries) {
          const { coin, effectiveAmount } = await entry.adapter.addWithdrawToTx!(
            tx, this._address, entry.maxAmount, entry.asset,
          );
          totalReceived += effectiveAmount;
          tx.transferObjects([coin], this._address);
        }
        return tx;
      }

      let lastTx: Transaction | undefined;
      for (const entry of entries) {
        const built = await entry.adapter.buildWithdrawTx(this._address, entry.maxAmount, entry.asset);
        totalReceived += built.effectiveAmount;
        lastTx = built.tx;
      }
      return lastTx!;
    });

    if (totalReceived <= 0) {
      throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw across any protocol');
    }

    return {
      success: true,
      tx: gasResult.digest,
      amount: totalReceived,
      gasCost: gasResult.gasCostSui,
    };
  }

  /**
   * [v0.51.0] Per-asset wallet balance lookup.
   *
   * `queryBalance.available` rolls up only `STABLE_ASSETS` (USDC), so it cannot
   * answer "do they have enough USDsui to save 10?". This helper hits
   * `getBalance` for the specific coin type — same mechanism `queryBalance`
   * uses internally — and converts to a human-readable amount using the asset's
   * decimals. Returns 0 (not a throw) when the address holds none of the asset,
   * matching the caller's existing "insufficient balance" error path.
   */
  private async _queryAssetBalance(coinType: string, decimals: number): Promise<number> {
    try {
      const bal = await this.client.getBalance({ owner: this._address, coinType });
      return Number(bal.totalBalance) / 10 ** decimals;
    } catch {
      return 0;
    }
  }

  private async _autoFundFromSavings(shortfall: number): Promise<void> {
    const positions = await this.positions();
    const savingsTotal = positions.positions
      .filter(p => p.type === 'save')
      .reduce((sum, p) => sum + p.amount, 0);

    if (savingsTotal < shortfall * 0.95) {
      const bal = await queryBalance(this.client, this._address);
      throw new T2000Error(
        'INSUFFICIENT_BALANCE',
        `Insufficient funds. Available: $${bal.available.toFixed(2)}, savings: $${savingsTotal.toFixed(2)}, requested shortfall: $${shortfall.toFixed(2)}`,
      );
    }

    const result = await this.withdraw({ amount: shortfall });
    if (result.amount < shortfall * 0.5) {
      throw new T2000Error(
        'WITHDRAW_FAILED',
        `Auto-withdraw from savings returned $${result.amount.toFixed(2)} — expected ~$${shortfall.toFixed(2)}. Try withdrawing manually first.`,
      );
    }

    const txInfo = await this.client.getTransactionBlock({
      digest: result.tx,
      options: { showBalanceChanges: true },
    });
    const usdcReceived = (txInfo.balanceChanges ?? []).some(
      c => c.coinType === SUPPORTED_ASSETS.USDC.type &&
           Number(c.amount) > 0 &&
           typeof c.owner === 'object' && 'AddressOwner' in c.owner &&
           c.owner.AddressOwner === this._address,
    );
    if (!usdcReceived) {
      throw new T2000Error('WITHDRAW_FAILED', 'Withdraw TX did not produce USDC');
    }
  }

  async maxWithdraw(): Promise<MaxWithdrawResult> {
    const adapter = await this.resolveLending(undefined, 'USDC', 'withdraw');
    return adapter.maxWithdraw(this._address, 'USDC');
  }

  // -- Borrowing --

  async borrow(params: { amount: number; asset?: SupportedAsset; protocol?: string }): Promise<BorrowResult> {
    this.enforcer.assertNotLocked();
    assertAllowedAsset('borrow', params.asset);
    // [v0.51.0] Default USDC, honor params.asset for the strategic-exception
    // set (USDC, USDsui — see OPERATION_ASSETS.borrow).
    const asset: SupportedAsset = (params.asset as SupportedAsset | undefined) ?? 'USDC';
    const adapter = await this.resolveLending(params.protocol, asset, 'borrow');

    const maxResult = await adapter.maxBorrow(this._address, asset);
    if (maxResult.maxAmount <= 0) {
      throw new T2000Error('NO_COLLATERAL', 'No collateral deposited. Make a save deposit first.');
    }
    if (params.amount > maxResult.maxAmount) {
      throw new T2000Error('HEALTH_FACTOR_TOO_LOW', `Max safe borrow: $${maxResult.maxAmount.toFixed(2)}. Only savings deposits count as borrowable collateral.`, {
        maxBorrow: maxResult.maxAmount,
        currentHF: maxResult.currentHF,
      });
    }
    // [B5 v2 / 2026-04-30] CLI / direct SDK borrows are fee-free. See save() above.
    const borrowAmount = params.amount;

    const gasResult = await executeTx(this.client, this._signer, async () => {
      const { tx } = await adapter.buildBorrowTx(this._address, borrowAmount, asset);
      return tx;
    });

    const hf = await adapter.getHealth(this._address);
    this.emitBalanceChange(asset, borrowAmount, 'borrow', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: borrowAmount,
      asset,
      fee: 0,
      healthFactor: hf.healthFactor,
      gasCost: gasResult.gasCostSui,
    };
  }

  async repay(params: { amount: number | 'all'; asset?: SupportedAsset; protocol?: string }): Promise<RepayResult> {
    this.enforcer.assertNotLocked();
    const allPositions = await this.registry.allPositions(this._address);
    const borrows: Array<{ protocolId: string; asset: string; amount: number; apy: number }> = [];
    for (const pos of allPositions) {
      if (params.protocol && pos.protocolId !== params.protocol) continue;
      for (const b of pos.positions.borrows) {
        if (b.amount > 0.001) borrows.push({ protocolId: pos.protocolId, asset: b.asset, amount: b.amount, apy: b.apy });
      }
    }

    if (borrows.length === 0) {
      throw new T2000Error('NO_COLLATERAL', 'No outstanding borrow to repay');
    }

    if (params.amount === 'all') {
      return this._repayAllBorrows(borrows);
    }

    // [v0.51.1] Filter by params.asset when supplied. Pre-v0.51.1 we always
    // sorted by APY and picked the highest-APY borrow regardless of asset —
    // which broke USDsui repayment because `target` could be any asset and
    // we'd then fetch USDC coins for it (type mismatch). When the caller
    // names an asset, only that asset's borrows are eligible.
    const eligible = params.asset
      ? borrows.filter((b) => b.asset === params.asset)
      : borrows;
    if (eligible.length === 0) {
      throw new T2000Error('NO_COLLATERAL', `No outstanding ${params.asset} borrow to repay`);
    }
    eligible.sort((a, b) => b.apy - a.apy);
    const target = eligible[0]!;
    const adapter = this.registry.getLending(target.protocolId);
    if (!adapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', `Protocol ${target.protocolId} not found`);

    const repayAmount = Math.min(params.amount, target.amount);
    // [v0.51.1] Resolve the borrowed asset's coin type instead of
    // hardcoding USDC. Repaying a USDsui debt with a USDC coin would fail
    // at NAVI (type mismatch) or worse, succeed against the wrong pool.
    const targetAssetInfo = SUPPORTED_ASSETS[target.asset as SupportedAsset]
      ?? SUPPORTED_ASSETS.USDC;

    const gasResult = await executeTx(this.client, this._signer, async () => {
      if (adapter.addRepayToTx) {
        const tx = new Transaction();
        tx.setSender(this._address);
        const raw = BigInt(Math.floor(repayAmount * 10 ** targetAssetInfo.decimals));
        const bal = await this.client.getBalance({
          owner: this._address,
          coinType: targetAssetInfo.type,
        });
        if (BigInt(bal.totalBalance) < raw) {
          throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${targetAssetInfo.displayName} balance for repayment`, {
            available: Number(bal.totalBalance) / 10 ** targetAssetInfo.decimals,
            required: repayAmount,
          });
        }
        const repayCoin = coinWithBalance({ type: targetAssetInfo.type, balance: raw })(tx);
        await adapter.addRepayToTx!(tx, this._address, repayCoin, target.asset);
        return tx;
      }

      const { tx } = await adapter.buildRepayTx(this._address, repayAmount, target.asset);
      return tx;
    });

    const hf = await adapter.getHealth(this._address);
    // [v0.51.1] Emit the actual asset, not always 'USDC'. Subscribers
    // rely on this event to refresh balance UIs.
    this.emitBalanceChange(target.asset, repayAmount, 'repay', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: repayAmount,
      asset: target.asset,
      remainingDebt: hf.borrowed,
      gasCost: gasResult.gasCostSui,
    };
  }

  private async _repayAllBorrows(borrows: Array<{ protocolId: string; asset: string; amount: number; apy: number }>): Promise<RepayResult> {
    borrows.sort((a, b) => b.apy - a.apy);

    const entries: Array<{ borrow: typeof borrows[0]; adapter: LendingAdapter }> = [];
    for (const borrow of borrows) {
      const adapter = this.registry.getLending(borrow.protocolId);
      if (adapter) entries.push({ borrow, adapter });
    }

    const canPTB = entries.every(e => e.adapter.addRepayToTx);
    let totalRepaid = 0;

    const gasResult = await executeTx(this.client, this._signer, async () => {
      if (canPTB) {
        const tx = new Transaction();
        tx.setSender(this._address);

        // [v0.51.1] Group borrows by asset and pre-flight balance per
        // asset. Pre-v0.51.1 we fetched USDC coins once and tried to repay
        // every borrow (including USDsui) from the same merged USDC. That
        // works when every borrow happens to be USDC; it silently breaks
        // the moment USDsui (or any other allowed borrow asset) appears.
        //
        // [2026-05-22] Address-balance migration. Per-borrow `coinWithBalance`
        // intents get auto-batched into one merge per coin type by the
        // resolver — no need to manually pre-merge.
        const uniqueAssets = Array.from(new Set(entries.map((e) => e.borrow.asset)));
        for (const asset of uniqueAssets) {
          const info = SUPPORTED_ASSETS[asset as SupportedAsset];
          if (!info) throw new T2000Error('ASSET_NOT_SUPPORTED', `Cannot repay unknown asset: ${asset}`);
          const required = entries
            .filter((e) => e.borrow.asset === asset)
            .reduce((sum, e) => sum + BigInt(Math.floor(e.borrow.amount * 10 ** info.decimals)), 0n);
          const bal = await this.client.getBalance({ owner: this._address, coinType: info.type });
          if (BigInt(bal.totalBalance) < required) {
            throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${info.displayName} balance for repayment`, {
              available: Number(bal.totalBalance) / 10 ** info.decimals,
              required: Number(required) / 10 ** info.decimals,
            });
          }
        }

        for (const { borrow, adapter } of entries) {
          const info = SUPPORTED_ASSETS[borrow.asset as SupportedAsset]!;
          const raw = BigInt(Math.floor(borrow.amount * 10 ** info.decimals));
          const repayCoin = coinWithBalance({ type: info.type, balance: raw })(tx);
          await adapter.addRepayToTx!(tx, this._address, repayCoin, borrow.asset);
          totalRepaid += borrow.amount;
        }

        return tx;
      }

      let lastTx: Transaction | undefined;
      for (const { borrow, adapter } of entries) {
        const { tx } = await adapter.buildRepayTx(this._address, borrow.amount, borrow.asset);
        lastTx = tx;
        totalRepaid += borrow.amount;
      }
      return lastTx!;
    });

    const firstAdapter = entries[0]?.adapter;
    const hf = firstAdapter ? await firstAdapter.getHealth(this._address) : { borrowed: 0 };
    // [v0.51.1] Mixed-asset repay-all emits a 'repay' event per dominant
    // asset (largest by amount). Single-asset case still fires correctly.
    const dominantAsset = entries
      .reduce((acc, e) => acc.amount >= e.borrow.amount ? acc : e.borrow, entries[0]?.borrow ?? { asset: 'USDC', amount: 0 })
      .asset;
    this.emitBalanceChange(dominantAsset, totalRepaid, 'repay', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: totalRepaid,
      asset: dominantAsset,
      remainingDebt: hf.borrowed,
      gasCost: gasResult.gasCostSui,
    };
  }

  async maxBorrow(): Promise<MaxBorrowResult> {
    const adapter = await this.resolveLending(undefined, 'USDC', 'borrow');
    return adapter.maxBorrow(this._address, 'USDC');
  }

  async healthFactor(): Promise<HealthFactorResult> {
    const adapter = await this.resolveLending(undefined, 'USDC', 'save');
    const hf = await adapter.getHealth(this._address);

    if (hf.healthFactor < 1.2) {
      this.emit('healthCritical', { healthFactor: hf.healthFactor, threshold: 1.5, severity: 'critical' });
    } else if (hf.healthFactor < 2.0) {
      this.emit('healthWarning', { healthFactor: hf.healthFactor, threshold: 2.0, severity: 'warning' });
    }

    return hf;
  }

  // -- Claim Rewards --

  async getPendingRewards(): Promise<PendingReward[]> {
    const adapters = this.registry.listLending().filter((a) => a.getPendingRewards);
    if (adapters.length === 0) return [];

    const results = await Promise.allSettled(
      adapters.map((a) => a.getPendingRewards!(this._address)),
    );
    const all: PendingReward[] = [];
    const errors: unknown[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
      else errors.push(r.reason);
    }
    // [S18-F20] If every adapter failed and we have nothing to show,
    // propagate the first error so the engine tool can surface
    // "NAVI degraded" instead of narrating "no pending rewards"
    // (a false negative). Today there is only one claim-capable adapter
    // (NAVI), so this collapses to "if NAVI threw, throw"; the loop
    // shape preserves graceful partial degradation when a 2nd adapter
    // (e.g. Suilend) lands.
    if (all.length === 0 && errors.length === adapters.length) {
      const first = errors[0];
      throw first instanceof Error ? first : new Error(String(first));
    }
    return all;
  }

  async claimRewards(): Promise<ClaimRewardsResult> {
    this.enforcer.assertNotLocked();

    const adapters = this.registry.listLending().filter((a) => a.addClaimRewardsToTx);
    if (adapters.length === 0) {
      return { success: true, tx: '', rewards: [], totalValueUsd: 0, gasCost: 0 };
    }

    const tx = new Transaction();
    tx.setSender(this._address);

    const allRewards: PendingReward[] = [];
    const errors: unknown[] = [];
    for (const adapter of adapters) {
      try {
        const claimed = await adapter.addClaimRewardsToTx!(tx, this._address);
        allRewards.push(...claimed);
      } catch (err) {
        errors.push(err);
      }
    }

    // [S18-F20] Propagate degradation when every adapter failed AND we
    // have nothing to claim. See `getPendingRewards` for the full
    // rationale — silent skip here was a primary contributor to the
    // engine narrating "no pending rewards" during NAVI degradation.
    if (allRewards.length === 0 && errors.length === adapters.length) {
      const first = errors[0];
      throw first instanceof Error ? first : new Error(String(first));
    }

    if (allRewards.length === 0) {
      return { success: true, tx: '', rewards: [], totalValueUsd: 0, gasCost: 0 };
    }

    const claimResult = await executeTx(this.client, this._signer, async () => tx);
    await this.client.waitForTransaction({ digest: claimResult.digest });

    const totalValueUsd = allRewards.reduce((s, r) => s + r.estimatedValueUsd, 0);

    return {
      success: true,
      tx: claimResult.digest,
      rewards: allRewards,
      totalValueUsd,
      gasCost: claimResult.gasCostSui,
    };
  }

  /**
   * Claim pending rewards, swap non-USDC tokens to USDC via Cetus, and deposit into NAVI.
   * Multi-step: claim (transfers to wallet) -> swap each reward token to USDC -> deposit USDC.
   * Minimum threshold: skips if total rewards < $0.10 (gas not worth it).
   */
  async compoundRewards(options: { minValueUsd?: number } = {}): Promise<CompoundRewardsResult> {
    this.enforcer.assertNotLocked();
    const minValue = options.minValueUsd ?? 0.10;
    const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;
    const USDC_DEC = SUPPORTED_ASSETS.USDC.decimals;

    const pending = await this.getPendingRewards();
    const nonTrivial = pending.filter((r) => r.amount > 0);
    if (nonTrivial.length === 0) {
      return {
        success: true, claimTx: '', swapTxs: [], depositTx: '',
        rewards: pending, totalCompoundedUsdc: 0, totalGasCost: 0,
      };
    }

    const totalPendingUsd = pending.reduce((s, r) => s + r.estimatedValueUsd, 0);
    if (totalPendingUsd > 0 && totalPendingUsd < minValue) {
      return {
        success: true, claimTx: '', swapTxs: [], depositTx: '',
        rewards: pending, totalCompoundedUsdc: 0, totalGasCost: 0,
      };
    }

    // Snapshot USDC balance before compounding to scope deposit correctly.
    // Use getBalance (sums coins + address balance) so claimed rewards
    // landing in address balance are counted in the pre-snapshot too.
    const preUsdcBal = await this.client.getBalance({ owner: this._address, coinType: USDC_TYPE });
    const preUsdcRaw = BigInt(preUsdcBal.totalBalance);

    // Step 1: Claim — transfers reward tokens to wallet
    const claimResult = await this.claimRewards();
    if (!claimResult.tx) {
      return {
        success: false, claimTx: '', swapTxs: [], depositTx: '',
        rewards: pending, totalCompoundedUsdc: 0, totalGasCost: 0,
      };
    }

    // Step 2: Swap each non-USDC reward token to USDC via Cetus
    const { findSwapRoute, buildSwapTx } = await import('./protocols/cetus-swap.js');
    const swapTxs: string[] = [];
    let totalGasCost = claimResult.gasCost;

    for (const reward of nonTrivial) {
      if (!reward.coinType) continue;
      if (reward.coinType === USDC_TYPE) continue;

      try {
        const decimals = getDecimalsForCoinType(reward.coinType) ?? 9;
        const rawAmount = BigInt(Math.floor(reward.amount * 10 ** decimals));
        if (rawAmount <= 0n) continue;

        const bal = await this.client.getBalance({ owner: this._address, coinType: reward.coinType });
        if (BigInt(bal.totalBalance) < rawAmount) continue;

        const route = await findSwapRoute({
          walletAddress: this._address,
          from: reward.coinType,
          to: USDC_TYPE,
          amount: rawAmount,
          byAmountIn: true,
        });

        if (!route || route.insufficientLiquidity) continue;

        const swapResult = await executeTx(this.client, this._signer, async () => {
          const tx = new Transaction();
          tx.setSender(this._address);

          const freshBal = await this.client.getBalance({ owner: this._address, coinType: reward.coinType });
          if (BigInt(freshBal.totalBalance) < rawAmount) return tx;

          const inputCoin = coinWithBalance({ type: reward.coinType, balance: rawAmount })(tx);

          const outputCoin = await buildSwapTx({
            walletAddress: this._address,
            route,
            tx,
            inputCoin,
            slippage: 0.01,
          });

          tx.transferObjects([outputCoin], this._address);
          return tx;
        });

        swapTxs.push(swapResult.digest);
        totalGasCost += swapResult.gasCostSui;
      } catch (err) {
        console.warn(`[compound] Failed to swap ${reward.symbol}:`, err instanceof Error ? err.message : err);
      }
    }

    // Step 3: Deposit only the NEW USDC gained from compounding (not pre-existing balance)
    const postUsdcBal = await this.client.getBalance({ owner: this._address, coinType: USDC_TYPE });
    const postUsdcRaw = BigInt(postUsdcBal.totalBalance);
    const gainedRaw = postUsdcRaw > preUsdcRaw ? postUsdcRaw - preUsdcRaw : 0n;
    const depositUsdc = Number(gainedRaw) / 10 ** USDC_DEC;

    let depositTx = '';
    if (gainedRaw > 0n) {
      try {
        const adapter = await this.resolveLending(undefined, 'USDC', 'save');
        const depositResult = await executeTx(this.client, this._signer, async () => {
          const tx = new Transaction();
          tx.setSender(this._address);
          const bal = await this.client.getBalance({ owner: this._address, coinType: USDC_TYPE });
          if (BigInt(bal.totalBalance) < gainedRaw) {
            throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC available after swap');
          }
          const inputCoin = coinWithBalance({ type: USDC_TYPE, balance: gainedRaw })(tx);
          await adapter.addSaveToTx!(tx, this._address, inputCoin, 'USDC');
          return tx;
        });
        depositTx = depositResult.digest;
        totalGasCost += depositResult.gasCostSui;
      } catch (err) {
        console.warn('[compound] NAVI deposit failed:', err instanceof Error ? err.message : err);
      }
    }

    const hasSubstantiveResult = swapTxs.length > 0 || depositTx !== '';
    return {
      success: hasSubstantiveResult,
      claimTx: claimResult.tx,
      swapTxs,
      depositTx,
      rewards: nonTrivial,
      totalCompoundedUsdc: depositUsdc,
      totalGasCost,
    };
  }

  // -- Info --

  async positions(): Promise<PositionsResult> {
    const allPositions = await this.registry.allPositions(this._address);
    const positions = allPositions.flatMap(p =>
      [
        ...p.positions.supplies
          .filter(s => s.amount > 0.005)
          .map(s => ({
            protocol: p.protocolId,
            asset: s.asset,
            type: 'save' as const,
            amount: s.amount,
            amountUsd: s.amountUsd,
            apy: s.apy,
          })),
        ...p.positions.borrows
          .filter(b => b.amount > 0.005)
          .map(b => ({
            protocol: p.protocolId,
            asset: b.asset,
            type: 'borrow' as const,
            amount: b.amount,
            amountUsd: b.amountUsd,
            apy: b.apy,
          })),
      ],
    );
    return { positions };
  }

  async rates(): Promise<RatesResult> {
    const allRatesResult = await this.registry.allRatesAcrossAssets();
    const result: RatesResult = {};
    for (const entry of allRatesResult) {
      if (!result[entry.asset] || entry.rates.saveApy > result[entry.asset].saveApy) {
        result[entry.asset] = { saveApy: entry.rates.saveApy, borrowApy: entry.rates.borrowApy };
      }
    }
    if (!result.USDC) result.USDC = { saveApy: 0, borrowApy: 0 };
    return result;
  }

  async allRates(asset = 'USDC') {
    return this.registry.allRates(asset);
  }

  async allRatesAcrossAssets() {
    return this.registry.allRatesAcrossAssets();
  }

  async earnings(): Promise<EarningsResult> {
    const result = await yieldTracker.getEarnings(this.client, this._address);

    if (result.totalYieldEarned > 0) {
      // [SPEC_AGENTIC_STACK P1 / SDK F1 — 2026-05-25] Removed stray `/ 100`.
      // `result.currentApy` is already a decimal (0.046 = 4.6%) — pre-fix this
      // emitted 0.00046 to `yield` event subscribers, masking the real APY 100x.
      // Matches what `EarningsResult.currentApy` declares + what `fundStatus()`
      // returns + what NAVI's MCP rate endpoint serves.
      this.emit('yield', {
        earned: result.dailyEarning,
        total: result.totalYieldEarned,
        apy: result.currentApy,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  async fundStatus(): Promise<FundStatusResult> {
    return yieldTracker.getFundStatus(this.client, this._address);
  }

  // -- Helpers --

  private async resolveLending(protocol: string | undefined, asset: string, capability: 'save' | 'withdraw' | 'borrow' | 'repay'): Promise<LendingAdapter> {
    if (protocol) {
      const adapter = this.registry.getLending(protocol);
      if (!adapter) throw new T2000Error('ASSET_NOT_SUPPORTED', `Lending adapter '${protocol}' not found`);
      return adapter;
    }

    if (capability === 'save') {
      const { adapter } = await this.registry.bestSaveRate(asset);
      return adapter;
    }

    if (capability === 'borrow' || capability === 'repay') {
      const adapters = this.registry.listLending().filter(
        a => a.supportedAssets.includes(asset) &&
             a.capabilities.includes(capability) &&
             (capability !== 'borrow' || a.supportsSameAssetBorrow),
      );
      if (adapters.length === 0) {
        const alternatives = this.registry.listLending().filter(
          a => a.capabilities.includes(capability) &&
               (capability !== 'borrow' || a.supportsSameAssetBorrow),
        );
        if (alternatives.length > 0) {
          const altList = alternatives.map(a => a.name).join(', ');
          const altAssets = [...new Set(alternatives.flatMap(a => [...a.supportedAssets]))].join(', ');
          throw new T2000Error('ASSET_NOT_SUPPORTED', `No protocol supports ${capability} for ${asset}. Available for ${capability}: ${altList} (assets: ${altAssets})`);
        }
        throw new T2000Error('ASSET_NOT_SUPPORTED', `No adapter supports ${capability} ${asset}`);
      }
      return adapters[0];
    }

    const adapters = this.registry.listLending().filter(
      a => a.supportedAssets.includes(asset) && a.capabilities.includes(capability),
    );
    if (adapters.length === 0) {
      const alternatives = this.registry.listLending().filter(
        a => a.capabilities.includes(capability),
      );
      if (alternatives.length > 0) {
        const altList = alternatives.map(a => `${a.name} (${[...a.supportedAssets].join(', ')})`).join('; ');
        throw new T2000Error('ASSET_NOT_SUPPORTED', `No protocol supports ${capability} for ${asset}. Try: ${altList}`);
      }
      throw new T2000Error('ASSET_NOT_SUPPORTED', `No adapter supports ${capability} ${asset}`);
    }
    return adapters[0];
  }

  private emitBalanceChange(asset: string, amount: number, cause: string, tx?: string): void {
    this.emit('balanceChange', { asset, previous: 0, current: 0, cause, tx });
  }
}

