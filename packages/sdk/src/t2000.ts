import { EventEmitter } from 'eventemitter3';
import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
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
import * as navi from './protocols/navi.js';
import { calculateFee, reportFee } from './protocols/protocolFee.js';
import * as yieldTracker from './protocols/yieldTracker.js';
import * as sentinel from './protocols/sentinel.js';
import { ProtocolRegistry } from './adapters/registry.js';
import { NaviAdapter } from './adapters/navi.js';
import { CetusAdapter } from './adapters/cetus.js';
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
} from './types.js';
import { T2000Error } from './errors.js';
import { SUPPORTED_ASSETS, DEFAULT_NETWORK, API_BASE_URL } from './constants.js';
import { truncateAddress } from './utils/sui.js';

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
  private readonly client: SuiClient;
  private readonly _address: string;
  private readonly registry: ProtocolRegistry;

  private constructor(keypair: Ed25519Keypair, client: SuiClient, registry?: ProtocolRegistry) {
    super();
    this.keypair = keypair;
    this.client = client;
    this._address = getAddress(keypair);
    this.registry = registry ?? T2000.createDefaultRegistry(client);
  }

  private static createDefaultRegistry(client: SuiClient): ProtocolRegistry {
    const registry = new ProtocolRegistry();
    const naviAdapter = new NaviAdapter();
    naviAdapter.initSync(client);
    registry.registerLending(naviAdapter);
    const cetusAdapter = new CetusAdapter();
    cetusAdapter.initSync(client);
    registry.registerSwap(cetusAdapter);
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
      return new T2000(keypair, client);
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
    return new T2000(keypair, client);
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
    const agent = new T2000(keypair, client);
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

  /** SuiClient used by this agent — exposed for x402 and other integrations. */
  get suiClient(): SuiClient {
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
    const asset = (params.asset ?? 'USDC') as keyof typeof SUPPORTED_ASSETS;
    if (!(asset in SUPPORTED_ASSETS)) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Asset ${asset} is not supported`);
    }

    const sendAmount = params.amount;
    const sendTo = params.to;

    const gasResult = await executeWithGas(this.client, this.keypair, () =>
      buildSendTx({ client: this.client, address: this._address, to: sendTo, amount: sendAmount, asset }),
    );

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
      bal.savings = savings;
      bal.total = bal.available + savings + bal.gasReserve.usdEquiv;
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

  async save(params: { amount: number | 'all'; asset?: string; protocol?: string }): Promise<SaveResult> {
    const asset = (params.asset ?? 'USDC').toUpperCase();
    if (asset !== 'USDC') {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Only USDC is supported for save. Got: ${asset}`);
    }

    let amount: number;
    if (params.amount === 'all') {
      const bal = await queryBalance(this.client, this._address);
      const GAS_RESERVE_USDC = 1.0;
      amount = bal.available - GAS_RESERVE_USDC;
      if (amount <= 0) {
        throw new T2000Error('INSUFFICIENT_BALANCE', 'Balance too low to save after $1 gas reserve', {
          reason: 'gas_reserve_required',
          available: bal.available,
        });
      }
    } else {
      amount = params.amount;
    }
    const fee = calculateFee('save', amount);
    const saveAmount = amount;

    const adapter = await this.resolveLending(params.protocol, asset, 'save');

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      const { tx } = await adapter.buildSaveTx(this._address, saveAmount, asset, { collectFee: true });
      return tx;
    });

    const rates = await adapter.getRates(asset);
    reportFee(this._address, 'save', fee.amount, fee.rate, gasResult.digest);
    this.emitBalanceChange('USDC', saveAmount, 'save', gasResult.digest);

    let savingsBalance = saveAmount;
    try {
      const positions = await this.positions();
      savingsBalance = positions.positions
        .filter((p) => p.type === 'save')
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

  async withdraw(params: { amount: number | 'all'; asset?: string; protocol?: string }): Promise<WithdrawResult> {
    const asset = (params.asset ?? 'USDC').toUpperCase();
    if (asset !== 'USDC') {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Only USDC is supported for withdraw. Got: ${asset}`);
    }

    const adapter = await this.resolveLending(params.protocol, asset, 'withdraw');

    let amount: number;
    if (params.amount === 'all') {
      const maxResult = await adapter.maxWithdraw(this._address, asset);
      amount = maxResult.maxAmount;
      if (amount <= 0) {
        throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw');
      }
    } else {
      amount = params.amount;

      const hf = await adapter.getHealth(this._address);
      if (hf.borrowed > 0) {
        const maxResult = await adapter.maxWithdraw(this._address, asset);
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
    let effectiveAmount = withdrawAmount;

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      const built = await adapter.buildWithdrawTx(this._address, withdrawAmount, asset);
      effectiveAmount = built.effectiveAmount;
      return built.tx;
    });

    this.emitBalanceChange('USDC', effectiveAmount, 'withdraw', gasResult.digest);

    return {
      success: true,
      tx: gasResult.digest,
      amount: effectiveAmount,
      gasCost: gasResult.gasCostSui,
      gasMethod: gasResult.gasMethod,
    };
  }

  async maxWithdraw(): Promise<MaxWithdrawResult> {
    const adapter = await this.resolveLending(undefined, 'USDC', 'withdraw');
    return adapter.maxWithdraw(this._address, 'USDC');
  }

  // -- Borrowing --

  async borrow(params: { amount: number; asset?: string; protocol?: string }): Promise<BorrowResult> {
    const asset = (params.asset ?? 'USDC').toUpperCase();
    if (asset !== 'USDC') {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Only USDC is supported for borrow. Got: ${asset}`);
    }

    const adapter = await this.resolveLending(params.protocol, asset, 'borrow');

    const maxResult = await adapter.maxBorrow(this._address, asset);
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
    this.emitBalanceChange('USDC', borrowAmount, 'borrow', gasResult.digest);

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

  async repay(params: { amount: number | 'all'; asset?: string; protocol?: string }): Promise<RepayResult> {
    const asset = (params.asset ?? 'USDC').toUpperCase();
    if (asset !== 'USDC') {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Only USDC is supported for repay. Got: ${asset}`);
    }

    const adapter = await this.resolveLending(params.protocol, asset, 'repay');

    let amount: number;
    if (params.amount === 'all') {
      const hf = await adapter.getHealth(this._address);
      amount = hf.borrowed;
      if (amount <= 0) {
        throw new T2000Error('NO_COLLATERAL', 'No outstanding borrow to repay');
      }
    } else {
      amount = params.amount;
    }
    const repayAmount = amount;

    const gasResult = await executeWithGas(this.client, this.keypair, async () => {
      const { tx } = await adapter.buildRepayTx(this._address, repayAmount, asset);
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

  // -- Swap --

  async swap(params: { from: string; to: string; amount: number; maxSlippage?: number; protocol?: string }): Promise<SwapResult> {
    const fromAsset = params.from.toUpperCase() as 'USDC' | 'SUI';
    const toAsset = params.to.toUpperCase() as 'USDC' | 'SUI';

    if (!(fromAsset in SUPPORTED_ASSETS) || !(toAsset in SUPPORTED_ASSETS)) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Swap pair ${fromAsset}/${toAsset} is not supported`);
    }
    if (fromAsset === toAsset) {
      throw new T2000Error('INVALID_AMOUNT', 'Cannot swap same asset');
    }

    let adapter: SwapAdapter;
    if (params.protocol) {
      const found = this.registry.getSwap(params.protocol);
      if (!found) throw new T2000Error('ASSET_NOT_SUPPORTED', `Swap adapter '${params.protocol}' not found`);
      adapter = found;
    } else {
      const best = await this.registry.bestSwapQuote(fromAsset, toAsset, params.amount);
      adapter = best.adapter;
    }

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

  async swapQuote(params: { from: string; to: string; amount: number }): Promise<{
    expectedOutput: number;
    priceImpact: number;
    poolPrice: number;
    fee: { amount: number; rate: number };
  }> {
    const fromAsset = params.from.toUpperCase();
    const toAsset = params.to.toUpperCase();
    const best = await this.registry.bestSwapQuote(fromAsset, toAsset, params.amount);
    const fee = calculateFee('swap', params.amount);
    return { ...best.quote, fee: { amount: fee.amount, rate: fee.rate } };
  }

  // -- Info --

  async positions(): Promise<PositionsResult> {
    const allPositions = await this.registry.allPositions(this._address);
    const positions = allPositions.flatMap(p =>
      [
        ...p.positions.supplies.map(s => ({
          protocol: p.protocolId,
          asset: s.asset,
          type: 'save' as const,
          amount: s.amount,
          apy: s.apy,
        })),
        ...p.positions.borrows.map(b => ({
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
    return navi.getRates(this.client);
  }

  async allRates(asset = 'USDC') {
    return this.registry.allRates(asset);
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
      if (adapters.length === 0) throw new T2000Error('ASSET_NOT_SUPPORTED', `No adapter supports ${capability} ${asset}`);
      return adapters[0];
    }

    const adapters = this.registry.listLending().filter(
      a => a.supportedAssets.includes(asset) && a.capabilities.includes(capability),
    );
    if (adapters.length === 0) throw new T2000Error('ASSET_NOT_SUPPORTED', `No adapter supports ${capability} ${asset}`);
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
