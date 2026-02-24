import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('./constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./constants.js')>();
  return {
    ...actual,
    T2000_PAYMENT_REGISTRY_ID: '0x' + 'b'.repeat(64),
  };
});

import { buildPaymentTransaction } from './payment-kit.js';
import { PAYMENT_KIT_PACKAGE, PAYMENT_KIT_MODULE, PAYMENT_KIT_FUNCTION, USDC_TYPE } from './constants.js';

const TEST_ADDRESS = '0x' + 'a'.repeat(64);
const TEST_COIN_1 = '0x' + '1'.repeat(64);
const TEST_COIN_2 = '0x' + '2'.repeat(64);
const TEST_COIN_3 = '0x' + '3'.repeat(64);

describe('buildPaymentTransaction', () => {
  const mockClient = {
    getCoins: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a valid PTB with correct Move call target', async () => {
    mockClient.getCoins.mockResolvedValue({
      data: [{ coinObjectId: TEST_COIN_1 }],
    });

    const tx = await buildPaymentTransaction(
      mockClient as unknown as Parameters<typeof buildPaymentTransaction>[0],
      '0xsender',
      { nonce: 'test-nonce-uuid', amount: '0.01', payTo: TEST_ADDRESS },
    );

    expect(tx).toBeDefined();
    const txData = tx.getData();
    expect(txData.commands).toBeDefined();

    const moveCallCmd = txData.commands.find(
      (cmd) => cmd.$kind === 'MoveCall',
    );
    expect(moveCallCmd).toBeDefined();

    if (moveCallCmd && moveCallCmd.$kind === 'MoveCall') {
      expect(moveCallCmd.MoveCall.package).toBe(PAYMENT_KIT_PACKAGE);
      expect(moveCallCmd.MoveCall.module).toBe(PAYMENT_KIT_MODULE);
      expect(moveCallCmd.MoveCall.function).toBe(PAYMENT_KIT_FUNCTION);
      expect(moveCallCmd.MoveCall.typeArguments).toContain(USDC_TYPE);
    }
  });

  it('merges multiple USDC coins when wallet has several', async () => {
    mockClient.getCoins.mockResolvedValue({
      data: [
        { coinObjectId: TEST_COIN_1 },
        { coinObjectId: TEST_COIN_2 },
        { coinObjectId: TEST_COIN_3 },
      ],
    });

    const tx = await buildPaymentTransaction(
      mockClient as unknown as Parameters<typeof buildPaymentTransaction>[0],
      '0xsender',
      { nonce: 'test-nonce', amount: '0.01', payTo: TEST_ADDRESS },
    );

    const mergeCmd = tx.getData().commands.find(
      (cmd) => cmd.$kind === 'MergeCoins',
    );
    expect(mergeCmd).toBeDefined();
  });

  it('throws when no USDC coins found', async () => {
    mockClient.getCoins.mockResolvedValue({ data: [] });

    await expect(
      buildPaymentTransaction(
        mockClient as unknown as Parameters<typeof buildPaymentTransaction>[0],
        '0xsender',
        { nonce: 'test-nonce', amount: '0.01', payTo: TEST_ADDRESS },
      ),
    ).rejects.toThrow('No USDC coins found');
  });
});
