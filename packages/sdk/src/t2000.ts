import { EventEmitter } from 'eventemitter3';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
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
import { executeTx } from './wallet/executeTx.js';
import { payWithMpp } from './wallet/pay.js';
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
// apps (Audric) own fee policy (Cetus `overlayFee` on swaps → T2000_OVERLAY_FEE_WALLET).
import type {
  T2000Options,
  BalanceResponse,
  SendResult,
  TransactionRecord,
  DepositInfo,
  PaymentRequest,
  PayOptions,
  PayResult,
  SwapResult,
  SwapQuoteResult,
} from './types.js';
import { T2000Error } from './errors.js';
import { SUPPORTED_ASSETS, assertAllowedAsset, type SendableAsset, type SupportedAsset } from './constants.js';

import { truncateAddress } from './utils/sui.js';
import { SafeguardEnforcer } from './safeguards/enforcer.js';
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
export class T2000 extends EventEmitter<T2000Events> {
  private readonly _signer: TransactionSigner;
  private readonly _keypair?: Ed25519Keypair;
  private readonly client: SuiGrpcClient;
  private readonly _address: string;
  readonly enforcer: SafeguardEnforcer;

  private constructor(keypair: Ed25519Keypair, client: SuiGrpcClient, configDir?: string);
  private constructor(signer: TransactionSigner, client: SuiGrpcClient, configDir: string | undefined, isSignerMode: true);
  private constructor(
    keypairOrSigner: Ed25519Keypair | TransactionSigner,
    client: SuiGrpcClient,
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
    this.enforcer = new SafeguardEnforcer(configDir);
    this.enforcer.load();
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
    return new T2000(keypair, client, DEFAULT_CONFIG_DIR);
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
    const agent = new T2000(keypair, client, DEFAULT_CONFIG_DIR);
    const address = agent.address();

    return { agent, address };
  }

  // -- Gas --

  /** SuiGrpcClient used by this agent — exposed for integrations. */
  get suiClient(): SuiGrpcClient {
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

    // Canonical gasless MPP pay loop lives in `wallet/pay.ts` (browser-safe,
    // shared with the Audric client's unified gasless write path). T2000
    // owns only the enforcer book-ends; the server budget ledger is the cap
    // on the browser side, so the client caller skips the enforcer.
    const result = await payWithMpp({ signer: this._signer, client: this.client, options });

    if (result.paid) {
      this.enforcer.recordUsage(result.cost ?? options.maxPrice ?? 1.0);
    }

    return result;
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
      const preBal = await this.client.core.getBalance({ owner: this._address, coinType: toType });
      preBalRaw = BigInt(preBal.balance.balance);
    } catch { /* first time holding this token — balance is 0 */ }

    const gasResult = await executeTx(this.client, this._signer, async () => {
      const tx = new Transaction();
      tx.setSender(this._address);

      let inputCoin: TransactionObjectArgument;
      if (fromType === '0x2::sui::SUI') {
        [inputCoin] = tx.splitCoins(tx.gas, [rawAmount]);
      } else {
        const bal = await this.client.core.getBalance({ owner: this._address, coinType: fromType });
        if (BigInt(bal.balance.balance) < rawAmount) {
          throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${params.from} balance.`, {
            available: Number(bal.balance.balance) / 10 ** fromDecimals,
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
      // [gRPC migration] core.waitForTransaction returns a discriminated union;
      // balanceChanges are `{ coinType, address, amount }` (signed string),
      // not the legacy `{ owner: { AddressOwner } }` shape.
      const fullTx = await this.client.core.waitForTransaction({
        digest: gasResult.digest,
        include: { balanceChanges: true },
        timeout: 8_000,
      });
      const txn = fullTx.$kind === 'Transaction' ? fullTx.Transaction : fullTx.FailedTransaction;
      const changes = txn.balanceChanges ?? [];
      const received = changes.find((c) => {
        if (BigInt(c.amount) <= 0n) return false;
        if (!c.address || c.address.toLowerCase() !== this._address.toLowerCase()) return false;
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
        const postBal = await this.client.core.getBalance({ owner: this._address, coinType: toType });
        const postRaw = BigInt(postBal.balance.balance);
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
   * Send `amount` of `asset` to `to` (hex address or SuiNS name).
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

    // Gasless-eligible stables (USDC / USDsui) build via the dedicated gRPC
    // client so the resolver can zero gas at simulate. SUI is not on the
    // `balance::send_funds` allowlist, so it builds via the default client
    // (also gRPC post-cutover) with normal gas — no separate build client.
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
      suinsName: resolved.suinsName,
      gasCost: gasResult.gasCostSui,
      gasCostUnit: 'SUI',
      balance,
    };
  }

  /**
   * Resolve a recipient string into a canonical 0x address:
   *   1. **hex** — `0x…` is used directly (no RPC round-trip).
   *   2. **SuiNS** — `alex.sui` resolves via `suix_resolveNameServiceAddress`.
   *
   * Anything else is rejected. (The legacy `contacts.json` alias map was
   * removed — SuiNS supersedes local contacts.)
   *
   * Returns `{ address, suinsName? }` so `send()` can stamp the name source
   * on the receipt without re-resolving. Throws
   * `T2000Error('SUINS_NOT_REGISTERED', …)` for well-formed but unregistered
   * SuiNS names, keeping the SDK error surface `T2000Error`-only.
   *
   * Public so MCP's `t2000_send` dryRun preview shares one resolution path
   * with the live execute path (never resolve the same input two ways).
   */
  async resolveRecipient(
    input: string,
  ): Promise<{ address: string; suinsName?: string }> {
    const trimmed = input.trim();
    if (SUI_ADDRESS_REGEX.test(trimmed)) {
      return { address: trimmed.toLowerCase() };
    }
    if (looksLikeSuiNs(trimmed)) {
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
    throw new T2000Error(
      'INVALID_ADDRESS',
      `Cannot resolve recipient "${input}". Provide a 0x address or a .sui name.`,
    );
  }

  async balance(): Promise<BalanceResponse> {
    // [NAVI removed] Wallet-only balance: spendable stables + SUI gas reserve.
    return queryBalance(this.client, this._address);
  }

  async history(params?: { limit?: number }): Promise<TransactionRecord[]> {
    return queryHistory(this._address, params?.limit);
  }

  async transactionDetail(digest: string): Promise<TransactionRecord | null> {
    return queryTransaction(digest, this._address);
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
    return new T2000(signer, client, undefined, true);
  }

  private emitBalanceChange(asset: string, amount: number, cause: string, tx?: string): void {
    this.emit('balanceChange', { asset, previous: 0, current: 0, cause, tx });
  }
}

