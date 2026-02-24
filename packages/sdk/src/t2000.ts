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
import * as suilend from './protocols/suilend.js';
import { solveHashcash } from './utils/hashcash.js';
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
  GasMethod,
} from './types.js';
import { T2000Error } from './errors.js';
import { SUPPORTED_ASSETS, DEFAULT_NETWORK, API_BASE_URL } from './constants.js';
import { truncateAddress } from './utils/sui.js';

interface T2000Events {
  balanceChange: (balance: BalanceResponse) => void;
  healthWarning: (hf: number) => void;
  healthCritical: (hf: number) => void;
  error: (error: T2000Error) => void;
}

export class T2000 extends EventEmitter<T2000Events> {
  private readonly keypair: Ed25519Keypair;
  private readonly client: SuiClient;
  private readonly _address: string;

  private constructor(keypair: Ed25519Keypair, client: SuiClient) {
    super();
    this.keypair = keypair;
    this.client = client;
    this._address = getAddress(keypair);
  }

  static async create(options: T2000Options = {}): Promise<T2000> {
    const { keyPath, passphrase, network = DEFAULT_NETWORK, rpcUrl, sponsored, name } = options;

    const client = getSuiClient(rpcUrl);

    if (sponsored) {
      const keypair = generateKeypair();
      if (passphrase) {
        await saveKey(keypair, passphrase, keyPath);
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

    if (!passphrase) {
      throw new T2000Error('WALLET_LOCKED', 'Passphrase required to unlock wallet');
    }

    const keypair = await loadKey(passphrase, keyPath);
    return new T2000(keypair, client);
  }

  static fromPrivateKey(privateKey: string, options: { network?: 'mainnet' | 'testnet'; rpcUrl?: string } = {}): T2000 {
    const keypair = keypairFromPrivateKey(privateKey);
    const client = getSuiClient(options.rpcUrl);
    return new T2000(keypair, client);
  }

  static async init(options: { passphrase: string; keyPath?: string; name?: string; sponsored?: boolean }): Promise<{ agent: T2000; address: string; sponsored: boolean }> {
    const keypair = generateKeypair();
    await saveKey(keypair, options.passphrase, options.keyPath);

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

  // -- Wallet --

  address(): string {
    return this._address;
  }

  async send(params: { to: string; amount: number; asset?: string }): Promise<SendResult> {
    const asset = (params.asset ?? 'USDC') as keyof typeof SUPPORTED_ASSETS;
    if (!(asset in SUPPORTED_ASSETS)) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Asset ${asset} is not supported`);
    }

    const gasMethod: GasMethod = 'self-funded';

    const result = await buildAndExecuteSend({
      client: this.client,
      keypair: this.keypair,
      to: params.to,
      amount: params.amount,
      asset,
    });

    const balance = await this.balance();
    this.emit('balanceChange', balance);

    return {
      success: true,
      tx: result.digest,
      amount: params.amount,
      to: params.to,
      gasCost: result.gasCost,
      gasCostUnit: 'SUI',
      gasMethod,
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
      // Suilend unavailable — show basic balance
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
    return suilend.save(this.client, this.keypair, amount);
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
    }
    return suilend.withdraw(this.client, this.keypair, amount);
  }

  async maxWithdraw(): Promise<MaxWithdrawResult> {
    return suilend.maxWithdrawAmount(this.client, this.keypair);
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
    return suilend.borrow(this.client, this.keypair, params.amount);
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
    return suilend.repay(this.client, this.keypair, amount);
  }

  async maxBorrow(): Promise<MaxBorrowResult> {
    return suilend.maxBorrowAmount(this.client, this.keypair);
  }

  async healthFactor(): Promise<HealthFactorResult> {
    const hf = await suilend.getHealthFactor(this.client, this.keypair);

    if (hf.healthFactor < 1.2) {
      this.emit('healthCritical', hf.healthFactor);
    } else if (hf.healthFactor < 2.0) {
      this.emit('healthWarning', hf.healthFactor);
    }

    return hf;
  }

  // -- Info --

  async positions(): Promise<PositionsResult> {
    return suilend.getPositions(this.client, this.keypair);
  }

  async rates(): Promise<RatesResult> {
    return suilend.getRates(this.client);
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
