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
import { buildAndExecuteSend } from './wallet/send.js';
import { queryBalance } from './wallet/balance.js';
import { queryHistory } from './wallet/history.js';
import * as navi from './protocols/navi.js';
import * as cetus from './protocols/cetus.js';
import { calculateFee, reportFee } from './protocols/protocolFee.js';
import * as yieldTracker from './protocols/yieldTracker.js';
import { solveHashcash } from './utils/hashcash.js';
import { shouldAutoTopUp, executeAutoTopUp } from './gas/autoTopUp.js';
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
  GasMethod,
  EarningsResult,
  FundStatusResult,
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
  private _lastGasMethod: GasMethod = 'self-funded';

  private constructor(keypair: Ed25519Keypair, client: SuiClient) {
    super();
    this.keypair = keypair;
    this.client = client;
    this._address = getAddress(keypair);
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

  /**
   * Ensure the agent has enough SUI for gas.
   * If SUI is low and USDC is available, auto-swaps $1 USDC → SUI.
   */
  private async ensureGas(): Promise<void> {
    this._lastGasMethod = 'self-funded';

    const needsTopUp = await shouldAutoTopUp(this.client, this._address);
    if (!needsTopUp) return;

    try {
      const result = await executeAutoTopUp(this.client, this.keypair);
      this._lastGasMethod = 'auto-topup';
      this.emit('gasAutoTopUp', {
        usdcSpent: result.usdcSpent,
        suiReceived: result.suiReceived,
      });
    } catch {
      this.emit('gasStationFallback', {
        reason: 'auto-topup failed',
        method: 'self-funded',
        suiUsed: 0,
      });
    }
  }

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

    await this.ensureGas();

    const result = await buildAndExecuteSend({
      client: this.client,
      keypair: this.keypair,
      to: params.to,
      amount: params.amount,
      asset,
    });

    const balance = await this.balance();

    this.emitBalanceChange(asset, params.amount, 'send', result.digest);

    return {
      success: true,
      tx: result.digest,
      amount: params.amount,
      to: params.to,
      gasCost: result.gasCost,
      gasCostUnit: 'SUI',
      gasMethod: this._lastGasMethod,
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

  // -- Savings --

  async save(params: { amount: number | 'all'; asset?: string }): Promise<SaveResult> {
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

    await this.ensureGas();
    const result = await navi.save(this.client, this.keypair, amount);

    reportFee(this._address, 'save', fee.amount, fee.rate, result.tx);

    this.emitBalanceChange('USDC', amount, 'save', result.tx);

    return { ...result, fee: fee.amount, gasMethod: this._lastGasMethod };
  }

  async withdraw(params: { amount: number | 'all'; asset?: string }): Promise<WithdrawResult> {
    let amount: number;
    if (params.amount === 'all') {
      const maxResult = await this.maxWithdraw();
      amount = maxResult.maxAmount;
      if (amount <= 0) {
        throw new T2000Error('NO_COLLATERAL', 'No savings to withdraw');
      }
    } else {
      amount = params.amount;

      // Risk check: would this withdrawal drop HF below minimum?
      const hf = await this.healthFactor();
      if (hf.borrowed > 0) {
        const maxResult = await this.maxWithdraw();
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
    await this.ensureGas();
    const result = await navi.withdraw(this.client, this.keypair, amount);

    this.emitBalanceChange('USDC', amount, 'withdraw', result.tx);

    return { ...result, gasMethod: this._lastGasMethod };
  }

  async maxWithdraw(): Promise<MaxWithdrawResult> {
    return navi.maxWithdrawAmount(this.client, this.keypair);
  }

  // -- Borrowing --

  async borrow(params: { amount: number; asset?: string }): Promise<BorrowResult> {
    const maxResult = await this.maxBorrow();
    if (params.amount > maxResult.maxAmount) {
      throw new T2000Error('HEALTH_FACTOR_TOO_LOW', `Max safe borrow: $${maxResult.maxAmount.toFixed(2)}`, {
        maxBorrow: maxResult.maxAmount,
        currentHF: maxResult.currentHF,
      });
    }
    const fee = calculateFee('borrow', params.amount);

    await this.ensureGas();
    const result = await navi.borrow(this.client, this.keypair, params.amount);

    reportFee(this._address, 'borrow', fee.amount, fee.rate, result.tx);

    this.emitBalanceChange('USDC', params.amount, 'borrow', result.tx);

    return { ...result, fee: fee.amount, gasMethod: this._lastGasMethod };
  }

  async repay(params: { amount: number | 'all'; asset?: string }): Promise<RepayResult> {
    let amount: number;
    if (params.amount === 'all') {
      const hf = await this.healthFactor();
      amount = hf.borrowed;
      if (amount <= 0) {
        throw new T2000Error('NO_COLLATERAL', 'No outstanding borrow to repay');
      }
    } else {
      amount = params.amount;
    }
    await this.ensureGas();
    const result = await navi.repay(this.client, this.keypair, amount);

    this.emitBalanceChange('USDC', amount, 'repay', result.tx);

    return { ...result, gasMethod: this._lastGasMethod };
  }

  async maxBorrow(): Promise<MaxBorrowResult> {
    return navi.maxBorrowAmount(this.client, this.keypair);
  }

  async healthFactor(): Promise<HealthFactorResult> {
    const hf = await navi.getHealthFactor(this.client, this.keypair);

    if (hf.healthFactor < 1.2) {
      this.emit('healthCritical', { healthFactor: hf.healthFactor, threshold: 1.5, severity: 'critical' });
    } else if (hf.healthFactor < 2.0) {
      this.emit('healthWarning', { healthFactor: hf.healthFactor, threshold: 2.0, severity: 'warning' });
    }

    return hf;
  }

  // -- Swap --

  async swap(params: { from: string; to: string; amount: number; maxSlippage?: number }): Promise<SwapResult> {
    const fromAsset = params.from.toUpperCase() as 'USDC' | 'SUI';
    const toAsset = params.to.toUpperCase() as 'USDC' | 'SUI';

    if (!(fromAsset in SUPPORTED_ASSETS) || !(toAsset in SUPPORTED_ASSETS)) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Swap pair ${fromAsset}/${toAsset} is not supported`);
    }
    if (fromAsset === toAsset) {
      throw new T2000Error('INVALID_AMOUNT', 'Cannot swap same asset');
    }

    const fee = calculateFee('swap', params.amount);

    await this.ensureGas();

    const result = await cetus.executeSwap({
      client: this.client,
      keypair: this.keypair,
      fromAsset,
      toAsset,
      amount: params.amount,
      maxSlippageBps: params.maxSlippage ? params.maxSlippage * 100 : undefined,
    });

    reportFee(this._address, 'swap', fee.amount, fee.rate, result.digest);

    this.emitBalanceChange(result.fromAsset, result.fromAmount, 'swap', result.digest);

    return {
      success: true,
      tx: result.digest,
      fromAmount: result.fromAmount,
      fromAsset: result.fromAsset,
      toAmount: result.toAmount,
      toAsset: result.toAsset,
      priceImpact: result.priceImpact,
      fee: fee.amount,
      gasCost: result.gasCost,
      gasMethod: this._lastGasMethod,
    };
  }

  async swapQuote(params: { from: string; to: string; amount: number }): Promise<{
    expectedOutput: number;
    priceImpact: number;
    poolPrice: number;
    fee: { amount: number; rate: number };
  }> {
    const fromAsset = params.from.toUpperCase() as 'USDC' | 'SUI';
    const toAsset = params.to.toUpperCase() as 'USDC' | 'SUI';
    const quote = await cetus.getSwapQuote(this.client, fromAsset, toAsset, params.amount);
    const fee = calculateFee('swap', params.amount);
    return { ...quote, fee: { amount: fee.amount, rate: fee.rate } };
  }

  // -- Info --

  async positions(): Promise<PositionsResult> {
    return navi.getPositions(this.client, this.keypair);
  }

  async rates(): Promise<RatesResult> {
    return navi.getRates(this.client);
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

  // -- Helpers --

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
