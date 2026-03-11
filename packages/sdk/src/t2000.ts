import { EventEmitter } from 'eventemitter3';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { getSuiClient } from './utils/sui.js';
import {
  generateKeypair,
  keypairFromPrivateKey,
  saveKey,
  loadKey,
  walletExists,
  exportPrivateKey,
  getAddress,
} from './wallet/keyManager.js';
import { buildSendTx } from './wallet/send.js';
import { queryBalance } from './wallet/balance.js';
import { queryHistory } from './wallet/history.js';
import { calculateFee, reportFee } from './protocols/protocolFee.js';
import * as yieldTracker from './protocols/yieldTracker.js';
import * as sentinel from './protocols/sentinel.js';
import { ProtocolRegistry } from './adapters/registry.js';
import { NaviAdapter } from './adapters/navi.js';
import { CetusAdapter } from './adapters/cetus.js';
import { SuilendAdapter } from './adapters/suilend.js';
import type { LendingAdapter, SwapAdapter } from './adapters/types.js';
import { solveHashcash } from './utils/hashcash.js';
import { executeWithGas } from './gas/manager.js';
import type {
  T2000Options,
  BalanceResponse,
  SendResult,
  SaveResult,
  WithdrawResult,
  BorrowResult,
  RepayResult,
  SwapResult,
  HealthFactorResult,
  MaxWithdrawResult,
  MaxBorrowResult,
  RatesResult,
  PositionsResult,
  TransactionRecord,
  DepositInfo,
  EarningsResult,
  FundStatusResult,
  SentinelAgent,
  SentinelAttackResult,
  RebalanceResult,
  RebalanceStep,
} from './types.js';
import { T2000Error } from './errors.js';
import { SUPPORTED_ASSETS, DEFAULT_NETWORK, API_BASE_URL } from './constants.js';
import { truncateAddress } from './utils/sui.js';
import { SafeguardEnforcer } from './safeguards/enforcer.js';
import type { TxMetadata } from './safeguards/types.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CONFIG_DIR = join(homedir(), '.t2000');

interface T2000Events {
  balanceChange: (event: { asset: string; previous: number; current: number; cause: string; tx?: string }) => void;
  healthWarning: (event: { healthFactor: number; threshold: number; severity: 'warning' }) => void;
  healthCritical: (event: { healthFactor: number; threshold: number; severity: 'critical' }) => void;
  yield: (event: { earned: number; total: number; apy: number; timestamp: number }) => void;
  gasAutoTopUp: (result: { usdcSpent: number; suiReceived: number }) => void;
  gasStationFallback: (event: { reason: string; method: string; suiUsed: number }) => void;
  error: (error: T2000Error) => void;
}

export class T2000 extends EventEmitter<T2000Events> {
  private readonly keypair: Ed25519Keypair;
  private readonly client: SuiJsonRpcClient;
  private readonly _address: string;
  private readonly registry: ProtocolRegistry;
  readonly enforcer: SafeguardEnforcer;

  private constructor(keypair: Ed25519Keypair, client: SuiJsonRpcClient, registry?: ProtocolRegistry, configDir?: string) {
    super();
    this.keypair = keypair;
    this.client = client;
    this._address = getAddress(keypair);
    this.registry = registry ?? T2000.createDefaultRegistry(client);
    this.enforcer = new SafeguardEnforcer(configDir);
    this.enforcer.load();
  }

  private static createDefaultRegistry(client: SuiJsonRpcClient): ProtocolRegistry {
    const registry = new ProtocolRegistry();
    const naviAdapter = new NaviAdapter();
    naviAdapter.initSync(client);
    registry.registerLending(naviAdapter);
    const cetusAdapter = new CetusAdapter();
    cetusAdapter.initSync(client);
    registry.registerSwap(cetusAdapter);
    const suilendAdapter = new SuilendAdapter();
    suilendAdapter.initSync(client);
    registry.registerLending(suilendAdapter);
    return registry;
  }

  static async create(options: T2000Options = {}): Promise<T2000> {
    const { keyPath, pin, passphrase, network = DEFAULT_NETWORK, rpcUrl, sponsored, name } = options;
    const secret = pin ?? passphrase;

    const client = getSuiClient(rpcUrl);

    if (sponsored) {
      const keypair = generateKeypair();
      if (secret) {
        await saveKey(keypair, secret, keyPath);
      }
      return new T2000(keypair, client, undefined, DEFAULT_CONFIG_DIR);
    }

    const exists = await walletExists(keyPath);
    if (!exists) {
      throw new T2000Error(
        'WALLET_NOT_FOUND',
        'No wallet found. Run `t2000 init` to create one.',
      );
    }

    if (!secret) {
      throw new T2000Error('WALLET_LOCKED', 'PIN required to unlock wallet');
    }

    const keypair = await loadKey(secret, keyPath);
    return new T2000(keypair, client, undefined, DEFAULT_CONFIG_DIR);
  }

  static fromPrivateKey(privateKey: string, options: { network?: 'mainnet' | 'testnet'; rpcUrl?: string } = {}): T2000 {
    const keypair = keypairFromPrivateKey(privateKey);
    const client = getSuiClient(options.rpcUrl);
    return new T2000(keypair, client);
  }

  static async init(options: { pin: string; passphrase?: string; keyPath?: string; name?: string; sponsored?: boolean }): Promise<{ agent: T2000; address: string; sponsored: boolean }> {
    const secret = options.pin ?? options.passphrase ?? '';
    const keypair = generateKeypair();
    await saveKey(keypair, secret, options.keyPath);

    const client = getSuiClient();
    const agent = new T2000(keypair, client, undefined, DEFAULT_CONFIG_DIR);
    const address = agent.address();

    let sponsored = false;
    if (options.sponsored !== false) {
      try {
        await callSponsorApi(address, options.name);
        sponsored = true;
      } catch {
        // Sponsor unavailable — agent can still be funded manually
      }
    }

    return { agent, address, sponsored };
  }

  // -- Gas --

  /** SuiJsonRpcClient used by this agent — exposed for x402 and other integrations. */
  get suiClient(): SuiJsonRpcClient {
    return this.client;
  }

  /** Ed25519Keypair used by this agent — exposed for x402 and other integrations. */
  get signer(): Ed25519Keypair {
    return this.keypair;
  }

  // -- Wallet --

  address(): string {
    return this._address;
  }

  async send(params: { to: string; amount: number; asset?: string }): Promise<SendResult> {
    this.enforcer.assertNotLocked();

    const asset = (params.asset ?? 'USDC') as keyof typeof SUPPORTED_ASSETS;
    if (!(asset in SUPPORTED_ASSETS)) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Asset ${asset} is not supported`);
    }

    const sendAmount = params.amount;
    const sendTo = params.to;

    const gasResult = await executeWithGas(this.client, this.keypair, () =>
      buildSendTx({ client: this.client, address: this._address, to: sendTo, amount: sendAmount, asset }),
      { metadata: { operation: 'send', amount: sendAmount }, enforcer: this.enforcer },
    );

    this.enforcer.recordUsage(sendAmount);
    const balance = await this.balance();

    this.emitBalanceChange(asset, sendAmount, 'send', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: sendAmount,
      to: params.to,
      gasCost: gasResult.gasCostSui,
      gasCostUnit: 'SUI',
      gasMethod: gasResult.gasMethod,
      balance,
    };
  }

  async balance(): Promise<BalanceResponse> {
    const bal = await queryBalance(this.client, this._address);

    try {
      const positions = await this.positions();
      const savings = positions.positions
        .filter((p) => p.type === 'save')
        .reduce((sum, p) => sum + p.amount, 0);
      const debt = positions.positions
        .filter((p) => p.type === 'borrow')
        .reduce((sum, p) => sum + p.amount, 0);
      bal.savings = savings;
      bal.debt = debt;
      bal.total = bal.available + savings - debt + bal.gasReserve.usdEquiv;
    } catch {
      // NAVI unavailable — show basic balance
    }

    return bal;
  }

  async history(params?: { limit?: number }): Promise<TransactionRecord[]> {
    return queryHistory(this.client, this._address, params?.limit);
  }

  async deposit(): Promise<DepositInfo> {
    return {
      address: this._address,
      network: 'Sui (mainnet)',
      supportedAssets: ['USDC'],
      instructions: [
        `Send USDC on Sui to: ${this._address}`,
        '',
        'From a CEX (Coinbase, Binance):',
        `  1. Withdraw USDC`,
        `  2. Select "Sui" network`,
        `  3. Paste address: ${truncateAddress(this._address)}`,
        '',
        'From another Sui wallet:',
        `  Transfer USDC to ${truncateAddress(this._address)}`,
      ].join('\n'),
    };
  }

  exportKey(): string {
    return exportPrivateKey(this.keypair);
  }

  async registerAdapter(adapter: LendingAdapter | SwapAdapter): Promise<void> {
    await adapter.init(this.client);
    if ('buildSaveTx' in adapter) this.registry.registerLending(adapter as LendingAdapter);
    if ('buildSwapTx' in adapter) this.registry.registerSwap(adapter as SwapAdapter);
  }

  // -- Savings --

  async save(params: { amount: number | 'all'; protocol?: string }): Promise<SaveResult> {
    this.enforcer.assertNotLocked();
    const asset = 'USDC';
    const bal = await queryBalance(this.client, this._address);
    const usdcBalance = bal.stables.USDC ?? 0;

    const needsAutoConvert =
      params.amount === 'all'
        ? Object.entries(bal.stables).some(([k, v]) => k !== 'USDC' && v > 0.01)
        : typeof params.amount === 'number' && params.amount > usdcBalance;

    let amount: number;
    if (params.amount === 'all') {
      amount = (bal.available ?? 0) - 1.0;
      if (amount <= 0) {
        throw new T2000Error('INSUFFICIENT_BALANCE', 'Balance too low to save after $1 gas reserve', {
          reason: 'gas_reserve_required', available: bal.available ?? 0,
        });
      }
    } else {
      amount = params.amount;
      if (amount > (bal.available ?? 0)) {
        throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient balance. Available: $${(bal.available ?? 0).toFixed(2)}, requested: $${amount.toFixed(2)}`);
      }
    }

    const fee = calculateFee('save', amount);
    const saveAmount = amount;
    const adapter = await this.resolveLending(params.protocol, asset, 'save');
    const swapAdapter = this.registry.listSwap()[0];
    const canPTB = adapter.addSaveToTx && (!needsAutoConvert || swapAdapter?.addSwapToTx);

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      if (canPTB && needsAutoConvert) {
        const tx = new Transaction();
        tx.setSender(this._address);
        const usdcCoins: TransactionObjectArgument[] = [];

        // Swap non-USDC stables → USDC within the same PTB
        for (const [stableAsset, stableAmount] of Object.entries(bal.stables)) {
          if (stableAsset === 'USDC' || stableAmount <= 0.01) continue;
          const assetInfo = SUPPORTED_ASSETS[stableAsset as keyof typeof SUPPORTED_ASSETS];
          if (!assetInfo) continue;

          const coins = await this._fetchCoins(assetInfo.type);
          if (coins.length === 0) continue;

          const merged = this._mergeCoinsInTx(tx, coins);
          const { outputCoin } = await swapAdapter!.addSwapToTx!(
            tx, this._address, merged, stableAsset, 'USDC', stableAmount,
          );
          usdcCoins.push(outputCoin);
        }

        // Add existing wallet USDC
        const existingUsdc = await this._fetchCoins(SUPPORTED_ASSETS.USDC.type);
        if (existingUsdc.length > 0) {
          usdcCoins.push(this._mergeCoinsInTx(tx, existingUsdc));
        }

        // Merge all USDC into one coin
        if (usdcCoins.length > 1) {
          tx.mergeCoins(usdcCoins[0], usdcCoins.slice(1));
        }

        await adapter.addSaveToTx!(tx, this._address, usdcCoins[0], asset, { collectFee: true });
        return tx;
      }

      if (canPTB && !needsAutoConvert) {
        const tx = new Transaction();
        tx.setSender(this._address);
        const existingUsdc = await this._fetchCoins(SUPPORTED_ASSETS.USDC.type);
        if (existingUsdc.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins found');

        const merged = this._mergeCoinsInTx(tx, existingUsdc);
        const rawAmount = BigInt(Math.floor(saveAmount * 10 ** SUPPORTED_ASSETS.USDC.decimals));
        const [depositCoin] = tx.splitCoins(merged, [rawAmount]);
        await adapter.addSaveToTx!(tx, this._address, depositCoin, asset, { collectFee: true });
        return tx;
      }

      // Fallback: non-composable path
      if (needsAutoConvert) {
        await this._convertWalletStablesToUsdc(bal, params.amount === 'all' ? undefined : amount - usdcBalance);
      }
      const { tx } = await adapter.buildSaveTx(this._address, saveAmount, asset, { collectFee: true });
      return tx;
    });

    const rates = await adapter.getRates(asset);
    reportFee(this._address, 'save', fee.amount, fee.rate, gasResult.digest);
    this.emitBalanceChange(asset, saveAmount, 'save', gasResult.digest);

    let savingsBalance = saveAmount;
    try {
      const positions = await this.positions();
      savingsBalance = positions.positions
        .filter((p) => p.type === 'save' && p.asset === asset)
        .reduce((sum, p) => sum + p.amount, 0);
    } catch {
      // query failed — fall back to deposit amount
    }

    return {
      success: true,
      tx: gasResult.digest,
      amount: saveAmount,
      apy: rates.saveApy,
      fee: fee.amount,
      gasCost: gasResult.gasCostSui,
      gasMethod: gasResult.gasMethod,
      savingsBalance,
    };
  }

  async withdraw(params: { amount: number | 'all'; protocol?: string }): Promise<WithdrawResult> {
    this.enforcer.assertNotLocked();
    if (params.amount === 'all' && !params.protocol) {
      return this.withdrawAllProtocols();
    }

    // Find the actual position to withdraw from (may be non-USDC after rebalance)
    const allPositions = await this.registry.allPositions(this._address);
    const supplies: Array<{ protocolId: string; asset: string; amount: number; apy: number }> = [];
    for (const pos of allPositions) {
      if (params.protocol && pos.protocolId !== params.protocol) continue;
      for (const s of pos.positions.supplies) {
        if (s.amount > 0.001) supplies.push({ protocolId: pos.protocolId, asset: s.asset, amount: s.amount, apy: s.apy });
      }
    }

    if (supplies.length === 0) {
      throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw');
    }

    // Withdraw from lowest-APY position first
    supplies.sort((a, b) => a.apy - b.apy);
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

    const swapAdapter = target.asset !== 'USDC' ? this.registry.listSwap()[0] : undefined;
    const canPTB = adapter.addWithdrawToTx && (!swapAdapter || swapAdapter.addSwapToTx);

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      if (canPTB) {
        const tx = new Transaction();
        tx.setSender(this._address);

        const { coin, effectiveAmount } = await adapter.addWithdrawToTx!(tx, this._address, withdrawAmount, target.asset);
        finalAmount = effectiveAmount;

        if (target.asset !== 'USDC' && swapAdapter?.addSwapToTx) {
          const { outputCoin, estimatedOut, toDecimals } = await swapAdapter.addSwapToTx(
            tx, this._address, coin, target.asset, 'USDC', effectiveAmount,
          );
          finalAmount = estimatedOut / 10 ** toDecimals;
          tx.transferObjects([outputCoin], this._address);
        } else {
          tx.transferObjects([coin], this._address);
        }
        return tx;
      }

      const built = await adapter.buildWithdrawTx(this._address, withdrawAmount, target.asset);
      finalAmount = built.effectiveAmount;
      return built.tx;
    });

    this.emitBalanceChange('USDC', finalAmount, 'withdraw', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: finalAmount,
      gasCost: gasResult.gasCostSui,
      gasMethod: gasResult.gasMethod,
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

    // Pre-check maxWithdraw for each position (use per-asset amount, not aggregate)
    const entries: Array<{ protocolId: string; asset: string; maxAmount: number; adapter: LendingAdapter }> = [];
    for (const entry of withdrawable) {
      const adapter = this.registry.getLending(entry.protocolId);
      if (!adapter) continue;
      const maxResult = await adapter.maxWithdraw(this._address, entry.asset);
      const perAssetMax = Math.min(entry.amount, maxResult.maxAmount);
      if (perAssetMax > 0.01) {
        entries.push({ ...entry, maxAmount: perAssetMax, adapter });
      }
    }

    if (entries.length === 0) {
      throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw across any protocol');
    }

    const swapAdapter = this.registry.listSwap()[0];
    const canPTB = entries.every(e => e.adapter.addWithdrawToTx) && (!swapAdapter || swapAdapter.addSwapToTx);

    let totalUsdcReceived = 0;

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      if (canPTB) {
        const tx = new Transaction();
        tx.setSender(this._address);
        const usdcCoins: TransactionObjectArgument[] = [];

        for (const entry of entries) {
          const { coin, effectiveAmount } = await entry.adapter.addWithdrawToTx!(
            tx, this._address, entry.maxAmount, entry.asset,
          );

          if (entry.asset !== 'USDC' && swapAdapter?.addSwapToTx) {
            const { outputCoin, estimatedOut, toDecimals } = await swapAdapter.addSwapToTx(
              tx, this._address, coin, entry.asset, 'USDC', effectiveAmount,
            );
            totalUsdcReceived += estimatedOut / 10 ** toDecimals;
            usdcCoins.push(outputCoin);
          } else {
            totalUsdcReceived += effectiveAmount;
            usdcCoins.push(coin);
          }
        }

        if (usdcCoins.length > 1) {
          tx.mergeCoins(usdcCoins[0], usdcCoins.slice(1));
        }
        tx.transferObjects([usdcCoins[0]], this._address);
        return tx;
      }

      // Fallback: multi-tx (shouldn't happen with current adapters)
      let lastTx: Transaction | undefined;
      for (const entry of entries) {
        const built = await entry.adapter.buildWithdrawTx(this._address, entry.maxAmount, entry.asset);
        totalUsdcReceived += built.effectiveAmount;
        lastTx = built.tx;
      }
      return lastTx!;
    });

    if (totalUsdcReceived <= 0) {
      throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw across any protocol');
    }

    return {
      success: true,
      tx: gasResult.digest,
      amount: totalUsdcReceived,
      gasCost: gasResult.gasCostSui,
      gasMethod: gasResult.gasMethod,
    };
  }

  private async _fetchCoins(coinType: string): Promise<Array<{ coinObjectId: string; balance: string }>> {
    const all: Array<{ coinObjectId: string; balance: string }> = [];
    let cursor: string | null | undefined;
    let hasNext = true;
    while (hasNext) {
      const page = await this.client.getCoins({ owner: this._address, coinType, cursor: cursor ?? undefined });
      all.push(...page.data.map((c) => ({ coinObjectId: c.coinObjectId, balance: c.balance })));
      cursor = page.nextCursor;
      hasNext = page.hasNextPage;
    }
    return all;
  }

  private _mergeCoinsInTx(tx: Transaction, coins: Array<{ coinObjectId: string; balance: string }>): TransactionObjectArgument {
    if (coins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No coins to merge');
    const primary = tx.object(coins[0].coinObjectId);
    if (coins.length > 1) {
      tx.mergeCoins(primary, coins.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    return primary;
  }

  private async _swapToUsdc(asset: string, amount: number): Promise<{ usdcReceived: number; digest: string; gasCost: number }> {
    const swapAdapter = this.registry.listSwap()[0];
    if (!swapAdapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', 'No swap adapter available');

    let estimatedOut = 0;
    let toDecimals = 6;

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      const built = await swapAdapter.buildSwapTx(this._address, asset, 'USDC', amount);
      estimatedOut = built.estimatedOut;
      toDecimals = built.toDecimals;
      return built.tx;
    });

    const usdcReceived = estimatedOut / 10 ** toDecimals;
    return { usdcReceived, digest: gasResult.digest, gasCost: gasResult.gasCostSui };
  }

  private async _swapFromUsdc(toAsset: string, amount: number): Promise<{ received: number; digest: string; gasCost: number }> {
    const swapAdapter = this.registry.listSwap()[0];
    if (!swapAdapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', 'No swap adapter available');

    let estimatedOut = 0;
    let toDecimals = 6;

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      const built = await swapAdapter.buildSwapTx(this._address, 'USDC', toAsset, amount);
      estimatedOut = built.estimatedOut;
      toDecimals = built.toDecimals;
      return built.tx;
    });

    const received = estimatedOut / 10 ** toDecimals;
    return { received, digest: gasResult.digest, gasCost: gasResult.gasCostSui };
  }

  private async _convertWalletStablesToUsdc(bal: BalanceResponse, amountNeeded?: number): Promise<void> {
    const nonUsdcStables: Array<{ asset: string; amount: number }> = [];
    for (const [asset, amount] of Object.entries(bal.stables)) {
      if (asset !== 'USDC' && amount > 0.01) {
        nonUsdcStables.push({ asset, amount });
      }
    }
    if (nonUsdcStables.length === 0) return;

    // Sort largest balance first for efficiency
    nonUsdcStables.sort((a, b) => b.amount - a.amount);

    let converted = 0;
    for (const entry of nonUsdcStables) {
      if (amountNeeded !== undefined && converted >= amountNeeded) break;
      try {
        await this._swapToUsdc(entry.asset, entry.amount);
        converted += entry.amount;
      } catch {
        // Skip this asset if swap fails, continue with others
      }
    }
  }

  async maxWithdraw(): Promise<MaxWithdrawResult> {
    const adapter = await this.resolveLending(undefined, 'USDC', 'withdraw');
    return adapter.maxWithdraw(this._address, 'USDC');
  }

  // -- Borrowing --

  async borrow(params: { amount: number; protocol?: string }): Promise<BorrowResult> {
    this.enforcer.assertNotLocked();
    const asset = 'USDC';
    const adapter = await this.resolveLending(params.protocol, asset, 'borrow');

    const maxResult = await adapter.maxBorrow(this._address, asset);
    if (maxResult.maxAmount <= 0) {
      throw new T2000Error('NO_COLLATERAL', 'No collateral deposited. Save first with `t2000 save <amount>`.');
    }
    if (params.amount > maxResult.maxAmount) {
      throw new T2000Error('HEALTH_FACTOR_TOO_LOW', `Max safe borrow: $${maxResult.maxAmount.toFixed(2)}`, {
        maxBorrow: maxResult.maxAmount,
        currentHF: maxResult.currentHF,
      });
    }
    const fee = calculateFee('borrow', params.amount);
    const borrowAmount = params.amount;

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      const { tx } = await adapter.buildBorrowTx(this._address, borrowAmount, asset, { collectFee: true });
      return tx;
    });

    const hf = await adapter.getHealth(this._address);
    reportFee(this._address, 'borrow', fee.amount, fee.rate, gasResult.digest);
    this.emitBalanceChange(asset, borrowAmount, 'borrow', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: borrowAmount,
      fee: fee.amount,
      healthFactor: hf.healthFactor,
      gasCost: gasResult.gasCostSui,
      gasMethod: gasResult.gasMethod,
    };
  }

  async repay(params: { amount: number | 'all'; protocol?: string }): Promise<RepayResult> {
    this.enforcer.assertNotLocked();
    // Find actual borrows (may be non-USDC from rebalance or legacy)
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

    // Repay highest-interest borrow first
    borrows.sort((a, b) => b.apy - a.apy);
    const target = borrows[0]!;
    const adapter = this.registry.getLending(target.protocolId);
    if (!adapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', `Protocol ${target.protocolId} not found`);

    const repayAmount = Math.min(params.amount, target.amount);
    const swapAdapter = target.asset !== 'USDC' ? this.registry.listSwap()[0] : undefined;
    const canPTB = adapter.addRepayToTx && (!swapAdapter || swapAdapter.addSwapToTx);

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      if (canPTB && target.asset !== 'USDC' && swapAdapter?.addSwapToTx) {
        const tx = new Transaction();
        tx.setSender(this._address);

        const buffer = repayAmount * 1.005;
        const usdcCoins = await this._fetchCoins(SUPPORTED_ASSETS.USDC.type);
        if (usdcCoins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins for swap');
        const merged = this._mergeCoinsInTx(tx, usdcCoins);
        const rawSwap = BigInt(Math.floor(buffer * 10 ** SUPPORTED_ASSETS.USDC.decimals));
        const [splitCoin] = tx.splitCoins(merged, [rawSwap]);

        const { outputCoin } = await swapAdapter.addSwapToTx(
          tx, this._address, splitCoin, 'USDC', target.asset, buffer,
        );

        await adapter.addRepayToTx!(tx, this._address, outputCoin, target.asset);
        return tx;
      }

      if (canPTB && target.asset === 'USDC') {
        const tx = new Transaction();
        tx.setSender(this._address);
        const usdcCoins = await this._fetchCoins(SUPPORTED_ASSETS.USDC.type);
        if (usdcCoins.length === 0) throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC coins');
        const merged = this._mergeCoinsInTx(tx, usdcCoins);
        const raw = BigInt(Math.floor(repayAmount * 10 ** SUPPORTED_ASSETS.USDC.decimals));
        const [repayCoin] = tx.splitCoins(merged, [raw]);
        await adapter.addRepayToTx!(tx, this._address, repayCoin, target.asset);
        return tx;
      }

      // Fallback: multi-tx
      if (target.asset !== 'USDC') {
        await this._swapFromUsdc(target.asset, repayAmount * 1.005);
      }
      const { tx } = await adapter.buildRepayTx(this._address, repayAmount, target.asset);
      return tx;
    });

    const hf = await adapter.getHealth(this._address);
    this.emitBalanceChange('USDC', repayAmount, 'repay', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: repayAmount,
      remainingDebt: hf.borrowed,
      gasCost: gasResult.gasCostSui,
      gasMethod: gasResult.gasMethod,
    };
  }

  private async _repayAllBorrows(borrows: Array<{ protocolId: string; asset: string; amount: number; apy: number }>): Promise<RepayResult> {
    borrows.sort((a, b) => b.apy - a.apy);

    const entries: Array<{ borrow: typeof borrows[0]; adapter: LendingAdapter }> = [];
    for (const borrow of borrows) {
      const adapter = this.registry.getLending(borrow.protocolId);
      if (adapter) entries.push({ borrow, adapter });
    }

    const swapAdapter = this.registry.listSwap()[0];
    const canPTB = entries.every(e => e.adapter.addRepayToTx) &&
      (entries.every(e => e.borrow.asset === 'USDC') || swapAdapter?.addSwapToTx);

    let totalRepaid = 0;

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      if (canPTB) {
        const tx = new Transaction();
        tx.setSender(this._address);

        // Pre-fetch USDC coins for any swaps or direct repays
        const usdcCoins = await this._fetchCoins(SUPPORTED_ASSETS.USDC.type);
        let usdcMerged: TransactionObjectArgument | undefined;
        if (usdcCoins.length > 0) {
          usdcMerged = this._mergeCoinsInTx(tx, usdcCoins);
        }

        for (const { borrow, adapter } of entries) {
          if (borrow.asset !== 'USDC' && swapAdapter?.addSwapToTx) {
            const buffer = borrow.amount * 1.005;
            const rawSwap = BigInt(Math.floor(buffer * 10 ** SUPPORTED_ASSETS.USDC.decimals));
            if (!usdcMerged) throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC for swap');
            const [splitCoin] = tx.splitCoins(usdcMerged, [rawSwap]);

            const { outputCoin } = await swapAdapter.addSwapToTx!(
              tx, this._address, splitCoin, 'USDC', borrow.asset, buffer,
            );
            await adapter.addRepayToTx!(tx, this._address, outputCoin, borrow.asset);
          } else {
            const raw = BigInt(Math.floor(borrow.amount * 10 ** SUPPORTED_ASSETS.USDC.decimals));
            if (!usdcMerged) throw new T2000Error('INSUFFICIENT_BALANCE', 'No USDC for repayment');
            const [repayCoin] = tx.splitCoins(usdcMerged, [raw]);
            await adapter.addRepayToTx!(tx, this._address, repayCoin, borrow.asset);
          }
          totalRepaid += borrow.amount;
        }

        return tx;
      }

      // Fallback: multi-tx
      let lastTx: Transaction | undefined;
      for (const { borrow, adapter } of entries) {
        if (borrow.asset !== 'USDC') {
          await this._swapFromUsdc(borrow.asset, borrow.amount * 1.005);
        }
        const { tx } = await adapter.buildRepayTx(this._address, borrow.amount, borrow.asset);
        lastTx = tx;
        totalRepaid += borrow.amount;
      }
      return lastTx!;
    });

    const firstAdapter = entries[0]?.adapter;
    const hf = firstAdapter ? await firstAdapter.getHealth(this._address) : { borrowed: 0 };
    this.emitBalanceChange('USDC', totalRepaid, 'repay', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: totalRepaid,
      remainingDebt: hf.borrowed,
      gasCost: gasResult.gasCostSui,
      gasMethod: gasResult.gasMethod,
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

  // -- Exchange --

  async exchange(params: { from: string; to: string; amount: number; maxSlippage?: number }): Promise<SwapResult> {
    this.enforcer.assertNotLocked();
    const fromAsset = params.from as keyof typeof SUPPORTED_ASSETS;
    const toAsset = params.to as keyof typeof SUPPORTED_ASSETS;

    if (!(fromAsset in SUPPORTED_ASSETS) || !(toAsset in SUPPORTED_ASSETS)) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Swap pair ${fromAsset}/${toAsset} is not supported`);
    }
    if (fromAsset === toAsset) {
      throw new T2000Error('INVALID_AMOUNT', 'Cannot swap same asset');
    }

    const best = await this.registry.bestSwapQuote(fromAsset, toAsset, params.amount);
    const adapter = best.adapter;

    const fee = calculateFee('swap', params.amount);
    const swapAmount = params.amount;
    const slippageBps = params.maxSlippage ? params.maxSlippage * 100 : undefined;

    let swapMeta: { estimatedOut: number; toDecimals: number } = { estimatedOut: 0, toDecimals: 0 };

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      const built = await adapter.buildSwapTx(this._address, fromAsset, toAsset, swapAmount, slippageBps);
      swapMeta = { estimatedOut: built.estimatedOut, toDecimals: built.toDecimals };
      return built.tx;
    });

    const toInfo = SUPPORTED_ASSETS[toAsset];
    await this.client.waitForTransaction({ digest: gasResult.digest });
    const txDetail = await this.client.getTransactionBlock({
      digest: gasResult.digest,
      options: { showBalanceChanges: true },
    });

    let actualReceived = 0;
    if (txDetail.balanceChanges) {
      for (const change of txDetail.balanceChanges) {
        if (
          change.coinType === toInfo.type &&
          change.owner &&
          typeof change.owner === 'object' &&
          'AddressOwner' in change.owner &&
          change.owner.AddressOwner === this._address
        ) {
          const amt = Number(change.amount) / 10 ** toInfo.decimals;
          if (amt > 0) actualReceived += amt;
        }
      }
    }

    const expectedOutput = swapMeta.estimatedOut / 10 ** swapMeta.toDecimals;
    if (actualReceived === 0) actualReceived = expectedOutput;

    const priceImpact = expectedOutput > 0
      ? Math.abs(actualReceived - expectedOutput) / expectedOutput
      : 0;

    reportFee(this._address, 'swap', fee.amount, fee.rate, gasResult.digest);
    this.emitBalanceChange(fromAsset, swapAmount, 'swap', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      fromAmount: swapAmount,
      fromAsset,
      toAmount: actualReceived,
      toAsset,
      priceImpact,
      fee: fee.amount,
      gasCost: gasResult.gasCostSui,
      gasMethod: gasResult.gasMethod,
    };
  }

  async exchangeQuote(params: { from: string; to: string; amount: number }): Promise<{
    expectedOutput: number;
    priceImpact: number;
    poolPrice: number;
    fee: { amount: number; rate: number };
  }> {
    const fromAsset = params.from;
    const toAsset = params.to;
    const best = await this.registry.bestSwapQuote(fromAsset, toAsset, params.amount);
    const fee = calculateFee('swap', params.amount);
    return { ...best.quote, fee: { amount: fee.amount, rate: fee.rate } };
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
            apy: s.apy,
          })),
        ...p.positions.borrows
          .filter(b => b.amount > 0.005)
          .map(b => ({
            protocol: p.protocolId,
            asset: b.asset,
            type: 'borrow' as const,
            amount: b.amount,
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

  async rebalance(opts: { dryRun?: boolean; minYieldDiff?: number; maxBreakEven?: number } = {}): Promise<RebalanceResult> {
    this.enforcer.assertNotLocked();
    const dryRun = opts.dryRun ?? false;
    const minYieldDiff = opts.minYieldDiff ?? 0.5;
    const maxBreakEven = opts.maxBreakEven ?? 30;

    const [allPositions, allRates] = await Promise.all([
      this.registry.allPositions(this._address),
      this.registry.allRatesAcrossAssets(),
    ]);

    const savePositions = allPositions.flatMap(p =>
      p.positions.supplies.filter(s => s.amount > 0.01).map(s => ({
        protocolId: p.protocolId,
        protocol: p.protocol,
        asset: s.asset,
        amount: s.amount,
        apy: s.apy,
      })),
    );

    if (savePositions.length === 0) {
      throw new T2000Error('NO_COLLATERAL', 'No savings positions to rebalance. Use `t2000 save <amount>` first.');
    }

    const borrowPositions = allPositions.flatMap(p =>
      p.positions.borrows.filter(b => b.amount > 0.01),
    );
    if (borrowPositions.length > 0) {
      const healthResults = await Promise.all(
        allPositions
          .filter(p => p.positions.borrows.some(b => b.amount > 0.01))
          .map(async p => {
            const adapter = this.registry.getLending(p.protocolId);
            if (!adapter) return null;
            return adapter.getHealth(this._address);
          }),
      );
      for (const hf of healthResults) {
        if (hf && hf.healthFactor < 1.5) {
          throw new T2000Error(
            'HEALTH_FACTOR_TOO_LOW',
            `Cannot rebalance — health factor is ${hf.healthFactor.toFixed(2)} (minimum 1.5). Repay some debt first.`,
            { healthFactor: hf.healthFactor },
          );
        }
      }
    }

    const bestRate = allRates.reduce((best, r) =>
      r.rates.saveApy > best.rates.saveApy ? r : best,
    );

    const current = savePositions.reduce((worst, p) =>
      p.apy < worst.apy ? p : worst,
    );

    const withdrawAdapter = this.registry.getLending(current.protocolId);
    if (withdrawAdapter) {
      try {
        const maxResult = await withdrawAdapter.maxWithdraw(this._address, current.asset);
        if (maxResult.maxAmount < current.amount) {
          current.amount = Math.max(0, maxResult.maxAmount - 0.01);
        }
      } catch { /* fall through with full amount */ }
    }

    if (current.amount <= 0.01) {
      throw new T2000Error(
        'HEALTH_FACTOR_TOO_LOW',
        'Cannot rebalance — active borrows prevent safe withdrawal. Repay some debt first.',
      );
    }

    const apyDiff = bestRate.rates.saveApy - current.apy;
    const isSameProtocol = current.protocolId === bestRate.protocolId;
    const isSameAsset = current.asset === bestRate.asset;

    if (apyDiff < minYieldDiff) {
      return {
        executed: false,
        steps: [],
        fromProtocol: current.protocol,
        fromAsset: current.asset,
        toProtocol: bestRate.protocol,
        toAsset: bestRate.asset,
        amount: current.amount,
        currentApy: current.apy,
        newApy: bestRate.rates.saveApy,
        annualGain: (current.amount * apyDiff) / 100,
        estimatedSwapCost: 0,
        breakEvenDays: Infinity,
        txDigests: [],
        totalGasCost: 0,
      };
    }

    if (isSameProtocol && isSameAsset) {
      return {
        executed: false,
        steps: [],
        fromProtocol: current.protocol,
        fromAsset: current.asset,
        toProtocol: bestRate.protocol,
        toAsset: bestRate.asset,
        amount: current.amount,
        currentApy: current.apy,
        newApy: bestRate.rates.saveApy,
        annualGain: 0,
        estimatedSwapCost: 0,
        breakEvenDays: Infinity,
        txDigests: [],
        totalGasCost: 0,
      };
    }

    const steps: RebalanceStep[] = [];
    let estimatedSwapCost = 0;

    steps.push({
      action: 'withdraw',
      protocol: current.protocolId,
      fromAsset: current.asset,
      amount: current.amount,
    });

    let amountToDeposit = current.amount;

    if (!isSameAsset) {
      try {
        const quote = await this.registry.bestSwapQuote(current.asset, bestRate.asset, current.amount);
        amountToDeposit = quote.quote.expectedOutput;
        estimatedSwapCost = Math.abs(current.amount - amountToDeposit);
      } catch {
        estimatedSwapCost = current.amount * 0.003;
        amountToDeposit = current.amount - estimatedSwapCost;
      }

      steps.push({
        action: 'swap',
        fromAsset: current.asset,
        toAsset: bestRate.asset,
        amount: current.amount,
        estimatedOutput: amountToDeposit,
      });
    }

    steps.push({
      action: 'deposit',
      protocol: bestRate.protocolId,
      toAsset: bestRate.asset,
      amount: amountToDeposit,
    });

    const annualGain = (amountToDeposit * apyDiff) / 100;
    const breakEvenDays = estimatedSwapCost > 0 ? Math.ceil((estimatedSwapCost / annualGain) * 365) : 0;

    if (breakEvenDays > maxBreakEven && estimatedSwapCost > 0) {
      return {
        executed: false,
        steps,
        fromProtocol: current.protocol,
        fromAsset: current.asset,
        toProtocol: bestRate.protocol,
        toAsset: bestRate.asset,
        amount: current.amount,
        currentApy: current.apy,
        newApy: bestRate.rates.saveApy,
        annualGain,
        estimatedSwapCost,
        breakEvenDays,
        txDigests: [],
        totalGasCost: 0,
      };
    }

    if (dryRun) {
      return {
        executed: false,
        steps,
        fromProtocol: current.protocol,
        fromAsset: current.asset,
        toProtocol: bestRate.protocol,
        toAsset: bestRate.asset,
        amount: current.amount,
        currentApy: current.apy,
        newApy: bestRate.rates.saveApy,
        annualGain,
        estimatedSwapCost,
        breakEvenDays,
        txDigests: [],
        totalGasCost: 0,
      };
    }

    if (!withdrawAdapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', `Protocol ${current.protocolId} not found`);

    const depositAdapter = this.registry.getLending(bestRate.protocolId);
    if (!depositAdapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', `Protocol ${bestRate.protocolId} not found`);

    const canComposePTB =
      withdrawAdapter.addWithdrawToTx && depositAdapter.addSaveToTx &&
      (isSameAsset || this.registry.listSwap()[0]?.addSwapToTx);

    let txDigests: string[];
    let totalGasCost: number;

    if (canComposePTB) {
      const result = await executeWithGas(this.client, this.keypair, async () => {
        const tx = new Transaction();
        tx.setSender(this._address);

        const { coin: withdrawnCoin, effectiveAmount } = await withdrawAdapter.addWithdrawToTx!(
          tx, this._address, current.amount, current.asset,
        );
        amountToDeposit = effectiveAmount;

        let depositCoin = withdrawnCoin;
        if (!isSameAsset) {
          const swapAdapter = this.registry.listSwap()[0];
          const { outputCoin, estimatedOut, toDecimals } = await swapAdapter.addSwapToTx!(
            tx, this._address, withdrawnCoin, current.asset, bestRate.asset, amountToDeposit,
          );
          depositCoin = outputCoin;
          amountToDeposit = estimatedOut / 10 ** toDecimals;
        }

        await depositAdapter.addSaveToTx!(
          tx, this._address, depositCoin, bestRate.asset, { collectFee: bestRate.asset === 'USDC' },
        );

        return tx;
      });
      txDigests = [result.digest];
      totalGasCost = result.gasCostSui;
    } else {
      txDigests = [];
      totalGasCost = 0;

      const withdrawResult = await executeWithGas(this.client, this.keypair, async () => {
        const built = await withdrawAdapter.buildWithdrawTx(this._address, current.amount, current.asset);
        amountToDeposit = built.effectiveAmount;
        return built.tx;
      });
      txDigests.push(withdrawResult.digest);
      totalGasCost += withdrawResult.gasCostSui;

      if (!isSameAsset) {
        const swapAdapter = this.registry.listSwap()[0];
        if (!swapAdapter) throw new T2000Error('PROTOCOL_UNAVAILABLE', 'No swap adapter available');

        const swapResult = await executeWithGas(this.client, this.keypair, async () => {
          const built = await swapAdapter.buildSwapTx(this._address, current.asset, bestRate.asset, amountToDeposit);
          amountToDeposit = built.estimatedOut / 10 ** built.toDecimals;
          return built.tx;
        });
        txDigests.push(swapResult.digest);
        totalGasCost += swapResult.gasCostSui;
      }

      const depositResult = await executeWithGas(this.client, this.keypair, async () => {
        const { tx } = await depositAdapter.buildSaveTx(this._address, amountToDeposit, bestRate.asset, { collectFee: bestRate.asset === 'USDC' });
        return tx;
      });
      txDigests.push(depositResult.digest);
      totalGasCost += depositResult.gasCostSui;
    }

    return {
      executed: true,
      steps,
      fromProtocol: current.protocol,
      fromAsset: current.asset,
      toProtocol: bestRate.protocol,
      toAsset: bestRate.asset,
      amount: current.amount,
      currentApy: current.apy,
      newApy: bestRate.rates.saveApy,
      annualGain,
      estimatedSwapCost,
      breakEvenDays,
      txDigests,
      totalGasCost,
    };
  }

  async earnings(): Promise<EarningsResult> {
    const result = await yieldTracker.getEarnings(this.client, this.keypair);

    if (result.totalYieldEarned > 0) {
      this.emit('yield', {
        earned: result.dailyEarning,
        total: result.totalYieldEarned,
        apy: result.currentApy / 100,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  async fundStatus(): Promise<FundStatusResult> {
    return yieldTracker.getFundStatus(this.client, this.keypair);
  }

  // -- Sentinel --

  async sentinelList(): Promise<SentinelAgent[]> {
    return sentinel.listSentinels();
  }

  async sentinelInfo(id: string): Promise<SentinelAgent> {
    return sentinel.getSentinelInfo(this.client, id);
  }

  async sentinelAttack(id: string, prompt: string, fee?: bigint): Promise<SentinelAttackResult> {
    this.enforcer.check({ operation: 'sentinel', amount: fee ? Number(fee) / 1e9 : 0.1 });
    return sentinel.attack(this.client, this.keypair, id, prompt, fee);
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

async function callSponsorApi(address: string, name?: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/sponsor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, name }),
  });

  if (res.status === 429) {
    const data = await res.json() as { challenge?: string };
    if (data.challenge) {
      const proof = solveHashcash(data.challenge);
      const retry = await fetch(`${API_BASE_URL}/api/sponsor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, name, proof }),
      });
      if (!retry.ok) throw new T2000Error('SPONSOR_RATE_LIMITED', 'Sponsor rate limited');
      return;
    }
  }

  if (!res.ok) {
    throw new T2000Error('SPONSOR_FAILED', 'Sponsor API unavailable');
  }
}
