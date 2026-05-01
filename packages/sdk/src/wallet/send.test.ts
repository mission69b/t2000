import { describe, it, expect, vi } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { buildSendTx, addSendToTx } from './send.js';
import { SUPPORTED_ASSETS } from '../constants.js';

function mockClient(usdcBalance: bigint = 10_000_000n) {
  return {
    getCoins: vi.fn().mockResolvedValue({
      data: [
        {
          coinObjectId: '0x' + '1'.repeat(64),
          balance: usdcBalance.toString(),
          coinType: SUPPORTED_ASSETS.USDC.type,
        },
      ],
    }),
  } as any;
}

const VALID_ADDRESS = '0x' + 'a'.repeat(64);

describe('buildSendTx', () => {
  it('returns a Transaction object for USDC send', async () => {
    const client = mockClient();
    const tx = await buildSendTx({
      client,
      address: VALID_ADDRESS,
      to: VALID_ADDRESS,
      amount: 1,
      asset: 'USDC',
    });

    expect(tx).toBeInstanceOf(Transaction);
  });

  it('returns a Transaction for SUI send (gas split)', async () => {
    const client = mockClient();
    const tx = await buildSendTx({
      client,
      address: VALID_ADDRESS,
      to: VALID_ADDRESS,
      amount: 0.01,
      asset: 'SUI',
    });

    expect(tx).toBeInstanceOf(Transaction);
  });

  it('throws for zero amount', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 0 }),
    ).rejects.toThrow('must be greater than zero');
  });

  it('throws for negative amount', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: -5 }),
    ).rejects.toThrow('must be greater than zero');
  });

  it('throws for invalid recipient address', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: 'not-an-address', amount: 1 }),
    ).rejects.toThrow();
  });

  it('throws for unsupported asset', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 1, asset: 'DOGE' as any }),
    ).rejects.toThrow('not supported');
  });

  it('throws when USDC balance is insufficient', async () => {
    const client = mockClient(100n); // 0.0001 USDC
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 100 }),
    ).rejects.toThrow('Insufficient');
  });

  it('throws when no USDC coins exist', async () => {
    const client = {
      getCoins: vi.fn().mockResolvedValue({ data: [] }),
    } as any;

    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 1 }),
    ).rejects.toThrow('No USDC coins found');
  });
});

describe('addSendToTx (SPEC 7 chain-mode send appender)', () => {
  it('appends a transferObjects command to an existing PTB', () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const [synthCoin] = tx.splitCoins(tx.gas, [1_000_000n]);
    const beforeCommands = (tx.getData().commands as unknown[]).length;

    addSendToTx(tx, synthCoin, VALID_ADDRESS);

    const afterCommands = (tx.getData().commands as unknown[]).length;
    expect(afterCommands).toBe(beforeCommands + 1);
    const last = tx.getData().commands[tx.getData().commands.length - 1] as { TransferObjects?: unknown };
    expect(last.TransferObjects).toBeDefined();
  });

  it('validates the recipient address', () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const [synthCoin] = tx.splitCoins(tx.gas, [1_000_000n]);

    expect(() => addSendToTx(tx, synthCoin, 'not-an-address')).toThrow();
  });

  it('does not call any RPC (synchronous, no client argument)', () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);
    const [synthCoin] = tx.splitCoins(tx.gas, [1_000_000n]);

    expect(() => addSendToTx(tx, synthCoin, VALID_ADDRESS)).not.toThrow();
    expect(typeof addSendToTx).toBe('function');
    expect(addSendToTx.length).toBe(3);
  });

  it('chains correctly from a prior appender output (smoke-pattern regression)', () => {
    const tx = new Transaction();
    tx.setSender(VALID_ADDRESS);

    const [withdrawnCoin] = tx.splitCoins(tx.gas, [10_000n]);
    addSendToTx(tx, withdrawnCoin, VALID_ADDRESS);

    const commands = tx.getData().commands as unknown[];
    expect(commands.length).toBe(2);

    const split = commands[0] as { SplitCoins?: unknown };
    const transfer = commands[1] as { TransferObjects?: unknown };
    expect(split.SplitCoins).toBeDefined();
    expect(transfer.TransferObjects).toBeDefined();
  });
});
