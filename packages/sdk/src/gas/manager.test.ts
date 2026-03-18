import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { T2000Error } from '../errors.js';

// Mock all external dependencies before importing the module under test
vi.mock('./autoTopUp.js', () => ({
  shouldAutoTopUp: vi.fn(),
  executeAutoTopUp: vi.fn(),
}));

vi.mock('./gasStation.js', () => ({
  requestGasSponsorship: vi.fn(),
  reportGasUsage: vi.fn(),
}));

// Import after mocks are set up
import { executeWithGas, type GasExecutionResult } from './manager.js';
import { shouldAutoTopUp, executeAutoTopUp } from './autoTopUp.js';
import { requestGasSponsorship } from './gasStation.js';

const MOCK_DIGEST = 'MockTxDigest123456789';
const MOCK_EFFECTS = {
  gasUsed: {
    computationCost: '1000000',
    storageCost: '2000000',
    storageRebate: '500000',
  },
};

function mockClient(suiBalance: bigint) {
  return {
    getBalance: vi.fn().mockResolvedValue({ totalBalance: suiBalance.toString() }),
    signAndExecuteTransaction: vi.fn().mockResolvedValue({
      digest: MOCK_DIGEST,
      effects: MOCK_EFFECTS,
    }),
    executeTransactionBlock: vi.fn().mockResolvedValue({
      digest: MOCK_DIGEST,
      effects: MOCK_EFFECTS,
    }),
    waitForTransaction: vi.fn().mockResolvedValue({}),
    getTransactionBlock: vi.fn().mockResolvedValue({ objectChanges: [] }),
  } as unknown as Parameters<typeof executeWithGas>[0];
}

function mockKeypair() {
  return {
    getPublicKey: () => ({
      toSuiAddress: () => '0x' + 'a'.repeat(64),
    }),
    signTransaction: vi.fn().mockResolvedValue({ signature: 'mock-sig' }),
  } as unknown as Parameters<typeof executeWithGas>[1];
}

function buildTx() {
  const tx = new Transaction();
  return tx;
}

describe('executeWithGas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Step 1: Self-funded', () => {
    it('uses self-funded when SUI balance >= 0.05', async () => {
      const client = mockClient(100_000_000n); // 0.1 SUI
      const keypair = mockKeypair();

      const result = await executeWithGas(client, keypair, () => buildTx());

      expect(result.gasMethod).toBe('self-funded');
      expect(result.digest).toBe(MOCK_DIGEST);
      expect(result.gasCostSui).toBeGreaterThan(0);
    });

    it('skips self-funded when SUI balance < 0.05', async () => {
      const client = mockClient(1_000_000n); // 0.001 SUI — too low
      const keypair = mockKeypair();
      vi.mocked(shouldAutoTopUp).mockResolvedValue(true);
      vi.mocked(executeAutoTopUp).mockResolvedValue({
        success: true,
        tx: 'topup-digest',
        usdcSpent: 1,
        suiReceived: 0.3,
      });
      // After topup, balance check will still use the mock that returns low balance
      // but the second signAndExecuteTransaction call will succeed
      // We need the getBalance mock to return enough after topup
      const balanceMock = vi.fn()
        .mockResolvedValueOnce({ totalBalance: '1000000' })    // Step 1: too low
        .mockResolvedValueOnce({ totalBalance: '1000000' })    // shouldAutoTopUp check
        .mockResolvedValueOnce({ totalBalance: '1000000' })    // shouldAutoTopUp check (USDC)
        .mockResolvedValueOnce({ totalBalance: '100000000' }); // Step 2: after topup, enough
      (client as any).getBalance = balanceMock;

      const result = await executeWithGas(client, keypair, () => buildTx());

      expect(result.gasMethod).toBe('auto-topup');
    });
  });

  describe('Step 2: Auto-topup', () => {
    it('swaps USDC→SUI then executes self-funded', async () => {
      const client = mockClient(1_000_000n); // low SUI
      const keypair = mockKeypair();

      vi.mocked(shouldAutoTopUp).mockResolvedValue(true);
      vi.mocked(executeAutoTopUp).mockResolvedValue({
        success: true,
        tx: 'topup-digest',
        usdcSpent: 1,
        suiReceived: 0.3,
      });

      const result = await executeWithGas(client, keypair, () => buildTx());

      expect(vi.mocked(executeAutoTopUp)).toHaveBeenCalledOnce();
      expect(result.gasMethod).toBe('auto-topup');
      expect(result.digest).toBe(MOCK_DIGEST);
    });

    it('falls through to sponsored when auto-topup fails', async () => {
      const client = mockClient(1_000_000n); // low SUI
      const keypair = mockKeypair();

      vi.mocked(shouldAutoTopUp).mockResolvedValue(true);
      vi.mocked(executeAutoTopUp).mockRejectedValue(new Error('auto-topup failed'));

      // Setup sponsored path
      vi.mocked(requestGasSponsorship).mockResolvedValue({
        txBytes: Buffer.from('mock-tx').toString('base64'),
        sponsorSignature: 'mock-sponsor-sig',
        type: 'fallback',
      } as any);

      // buildTx for sponsored path calls tx.build() which needs client
      // We mock the sponsored path to succeed
      const buildSpy = vi.spyOn(Transaction.prototype, 'build')
        .mockResolvedValue(new Uint8Array([1, 2, 3]));

      const result = await executeWithGas(client, keypair, () => buildTx());

      expect(result.gasMethod).toBe('sponsored');
      buildSpy.mockRestore();
    });

    it('skips auto-topup when shouldAutoTopUp returns false', async () => {
      const client = mockClient(1_000_000n); // low SUI
      const keypair = mockKeypair();

      vi.mocked(shouldAutoTopUp).mockResolvedValue(false);

      // Sponsored path
      vi.mocked(requestGasSponsorship).mockResolvedValue({
        txBytes: Buffer.from('mock-tx').toString('base64'),
        sponsorSignature: 'mock-sponsor-sig',
        type: 'fallback',
      } as any);

      const buildSpy = vi.spyOn(Transaction.prototype, 'build')
        .mockResolvedValue(new Uint8Array([1, 2, 3]));

      const result = await executeWithGas(client, keypair, () => buildTx());

      expect(vi.mocked(executeAutoTopUp)).not.toHaveBeenCalled();
      expect(result.gasMethod).toBe('sponsored');
      buildSpy.mockRestore();
    });
  });

  describe('Step 3: Sponsored', () => {
    it('uses gas station when self-funded and auto-topup both fail', async () => {
      const client = mockClient(1_000_000n); // low SUI
      const keypair = mockKeypair();

      vi.mocked(shouldAutoTopUp).mockResolvedValue(false);
      vi.mocked(requestGasSponsorship).mockResolvedValue({
        txBytes: Buffer.from('mock-tx').toString('base64'),
        sponsorSignature: 'mock-sponsor-sig',
        type: 'fallback',
      } as any);

      const buildSpy = vi.spyOn(Transaction.prototype, 'build')
        .mockResolvedValue(new Uint8Array([1, 2, 3]));

      const result = await executeWithGas(client, keypair, () => buildTx());

      expect(result.gasMethod).toBe('sponsored');
      expect(vi.mocked(requestGasSponsorship)).toHaveBeenCalledOnce();
      buildSpy.mockRestore();
    });
  });

  describe('Step 4: All methods exhausted', () => {
    it('throws INSUFFICIENT_GAS when all methods fail', async () => {
      const client = mockClient(1_000_000n); // low SUI
      const keypair = mockKeypair();

      vi.mocked(shouldAutoTopUp).mockResolvedValue(false);
      vi.mocked(requestGasSponsorship).mockRejectedValue(new Error('gas station down'));

      const buildSpy = vi.spyOn(Transaction.prototype, 'build')
        .mockResolvedValue(new Uint8Array([1, 2, 3]));

      await expect(
        executeWithGas(client, keypair, () => buildTx()),
      ).rejects.toThrow('No SUI for gas');

      buildSpy.mockRestore();
    });

    it('error has correct code', async () => {
      const client = mockClient(1_000_000n);
      const keypair = mockKeypair();

      vi.mocked(shouldAutoTopUp).mockResolvedValue(false);
      vi.mocked(requestGasSponsorship).mockRejectedValue(new Error('down'));

      const buildSpy = vi.spyOn(Transaction.prototype, 'build')
        .mockResolvedValue(new Uint8Array([1, 2, 3]));

      try {
        await executeWithGas(client, keypair, () => buildTx());
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(T2000Error);
        expect((err as T2000Error).code).toBe('INSUFFICIENT_GAS');
      }

      buildSpy.mockRestore();
    });
  });

  describe('buildTx callback', () => {
    it('calls buildTx fresh for each gas strategy attempt', async () => {
      const client = mockClient(1_000_000n); // low SUI — skip step 1
      const keypair = mockKeypair();
      let buildCount = 0;

      vi.mocked(shouldAutoTopUp).mockResolvedValue(false);
      vi.mocked(requestGasSponsorship).mockResolvedValue({
        txBytes: Buffer.from('mock-tx').toString('base64'),
        sponsorSignature: 'mock-sponsor-sig',
        type: 'fallback',
      } as any);

      const buildSpy = vi.spyOn(Transaction.prototype, 'build')
        .mockResolvedValue(new Uint8Array([1, 2, 3]));

      await executeWithGas(client, keypair, () => {
        buildCount++;
        return buildTx();
      });

      // Called once for step 1 (fails), once for step 2 (skipped via shouldAutoTopUp=false),
      // once for step 3 (sponsored succeeds)
      expect(buildCount).toBeGreaterThanOrEqual(2);
      buildSpy.mockRestore();
    });
  });

  describe('extractGasCost', () => {
    it('correctly calculates gas cost from effects', async () => {
      const client = mockClient(100_000_000n);
      const keypair = mockKeypair();

      const result = await executeWithGas(client, keypair, () => buildTx());

      // (1000000 + 2000000 - 500000) / 1e9 = 0.0025
      expect(result.gasCostSui).toBeCloseTo(0.0025, 6);
    });
  });
});
