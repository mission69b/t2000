import { describe, it, expect, vi } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { buildSendTx, addSendToTx } from './send.js';
import { SUPPORTED_ASSETS } from '../constants.js';

function mockClient(balanceOverride?: bigint, coinType?: string) {
  return {
    core: {
      getBalance: vi.fn().mockResolvedValue({
        balance: {
          coinType: coinType ?? SUPPORTED_ASSETS.USDC.type,
          balance: (balanceOverride ?? 10_000_000n).toString(),
          coinBalance: '0',
          addressBalance: '0',
        },
      }),
    },
  } as any;
}

const VALID_ADDRESS = '0x' + 'a'.repeat(64);

describe('buildSendTx — v4 gasless path (USDC)', () => {
  it('builds a 0x2::balance::send_funds Move call for USDC', async () => {
    const client = mockClient();
    const tx = await buildSendTx({
      client,
      address: VALID_ADDRESS,
      to: VALID_ADDRESS,
      amount: 1,
      asset: 'USDC',
    });

    expect(tx).toBeInstanceOf(Transaction);
    const data = tx.getData();
    const moveCalls = data.commands.filter(
      (c) => 'MoveCall' in (c as Record<string, unknown>),
    ) as Array<{ MoveCall: { module: string; function: string; package: string } }>;
    expect(moveCalls.length).toBe(1);
    expect(moveCalls[0].MoveCall.module).toBe('balance');
    expect(moveCalls[0].MoveCall.function).toBe('send_funds');
  });

  it('builds a 0x2::balance::send_funds Move call for USDsui', async () => {
    const client = mockClient(undefined, SUPPORTED_ASSETS.USDsui.type);
    const tx = await buildSendTx({
      client,
      address: VALID_ADDRESS,
      to: VALID_ADDRESS,
      amount: 1,
      asset: 'USDsui',
    });

    expect(tx).toBeInstanceOf(Transaction);
    const data = tx.getData();
    const moveCalls = data.commands.filter(
      (c) => 'MoveCall' in (c as Record<string, unknown>),
    );
    expect(moveCalls.length).toBe(1);
  });

  it('rejects USDC amounts below 0.01 (gasless protocol minimum)', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 0.005, asset: 'USDC' }),
    ).rejects.toThrow(/Minimum gasless transfer is 0\.01/);
  });

  it('rejects USDsui amounts below 0.01', async () => {
    const client = mockClient(undefined, SUPPORTED_ASSETS.USDsui.type);
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 0.001, asset: 'USDsui' }),
    ).rejects.toThrow(/Minimum gasless transfer/);
  });

  // The protocol validator rejects gasless withdrawals that leave a dust
  // remainder (0 < remainder < 0.01). Verified live 2026-07-19: the raw node
  // error is "Invalid withdraw reservation ... must either use the entire
  // balance, or leave at least 10000". We surface a clear error pre-build.
  it('rejects a send that leaves a dust remainder below the 0.01 floor', async () => {
    const client = mockClient(146_250n); // 0.14625 USDC — the live e2e payout shape
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 0.14, asset: 'USDC' }),
    ).rejects.toThrow(/entire balance or leave at least 0\.01/);
  });

  it('allows a send-all (remainder exactly zero)', async () => {
    const client = mockClient(146_250n);
    const tx = await buildSendTx({
      client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 0.14625, asset: 'USDC',
    });
    expect(tx).toBeInstanceOf(Transaction);
  });

  it('allows a send leaving exactly the 0.01 floor', async () => {
    const client = mockClient(146_250n);
    const tx = await buildSendTx({
      client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 0.13625, asset: 'USDC',
    });
    expect(tx).toBeInstanceOf(Transaction);
  });
});

describe('buildSendTx — SUI gas-native path', () => {
  it('builds a tx.splitCoins(tx.gas) + transferObjects for SUI', async () => {
    const client = mockClient(1_000_000_000n, '0x2::sui::SUI');
    const tx = await buildSendTx({
      client,
      address: VALID_ADDRESS,
      to: VALID_ADDRESS,
      amount: 0.01,
      asset: 'SUI',
    });

    expect(tx).toBeInstanceOf(Transaction);
    const data = tx.getData();
    // SUI path produces a SplitCoins + TransferObjects pair — no Move call.
    const moveCalls = data.commands.filter(
      (c) => 'MoveCall' in (c as Record<string, unknown>),
    );
    expect(moveCalls.length).toBe(0);
    const splits = data.commands.filter(
      (c) => 'SplitCoins' in (c as Record<string, unknown>),
    );
    expect(splits.length).toBe(1);
    const transfers = data.commands.filter(
      (c) => 'TransferObjects' in (c as Record<string, unknown>),
    );
    expect(transfers.length).toBe(1);
  });

  it('does not enforce the 0.01 minimum for SUI sends', async () => {
    const client = mockClient(1_000_000_000n, '0x2::sui::SUI');
    const tx = await buildSendTx({
      client,
      address: VALID_ADDRESS,
      to: VALID_ADDRESS,
      amount: 0.001,
      asset: 'SUI',
    });
    expect(tx).toBeInstanceOf(Transaction);
  });
});

describe('buildSendTx — asset constraint (v4)', () => {
  it('throws INVALID_ASSET for USDT', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 1, asset: 'USDT' as any }),
    ).rejects.toThrow(/send only supports USDC, USDsui, SUI/);
  });

  it('throws INVALID_ASSET for USDe', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 1, asset: 'USDe' as any }),
    ).rejects.toThrow(/send only supports USDC, USDsui, SUI/);
  });

  it('throws INVALID_ASSET for WAL', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 1, asset: 'WAL' as any }),
    ).rejects.toThrow(/send only supports/);
  });

  it('error message hints at swapping to USDC / USDsui first', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 1, asset: 'GOLD' as any }),
    ).rejects.toThrow(/Swap to USDC or USDsui first/);
  });
});

describe('buildSendTx — preflight + validation', () => {
  it('throws for zero amount', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 0, asset: 'USDC' }),
    ).rejects.toThrow('must be greater than zero');
  });

  it('throws for negative amount', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: -5, asset: 'USDC' }),
    ).rejects.toThrow('must be greater than zero');
  });

  it('throws for invalid recipient address', async () => {
    const client = mockClient();
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: 'not-an-address', amount: 1, asset: 'USDC' }),
    ).rejects.toThrow();
  });

  it('throws when USDC balance is insufficient', async () => {
    const client = mockClient(100n);
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 100, asset: 'USDC' }),
    ).rejects.toThrow('Insufficient');
  });

  it('throws when USDC balance is zero', async () => {
    const client = mockClient(0n);
    await expect(
      buildSendTx({ client, address: VALID_ADDRESS, to: VALID_ADDRESS, amount: 1, asset: 'USDC' }),
    ).rejects.toThrow('Insufficient');
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
