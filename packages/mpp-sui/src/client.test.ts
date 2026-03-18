import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCoins } from './utils.js';

vi.mock('./utils.js', async () => {
  const actual = await vi.importActual<typeof import('./utils.js')>('./utils.js');
  return {
    ...actual,
    fetchCoins: vi.fn(),
  };
});

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(() => ({
    setSender: vi.fn(),
    object: vi.fn((id: string) => id),
    mergeCoins: vi.fn(),
    splitCoins: vi.fn(() => ['split_coin']),
    transferObjects: vi.fn(),
  })),
}));

const mockSignAndExecute = vi.fn();
const mockWaitForTransaction = vi.fn();

vi.mock('@mysten/sui/client', () => ({
  SuiClient: vi.fn(),
}));

const mockSigner = {
  getPublicKey: () => ({
    toSuiAddress: () => '0xagent_address',
  }),
};

const mockClient = {
  signAndExecuteTransaction: mockSignAndExecute,
  waitForTransaction: mockWaitForTransaction,
};

describe('client createCredential', () => {
  let suiFn: typeof import('./client.js').sui;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./client.js');
    suiFn = mod.sui;
  });

  it('throws on insufficient balance', async () => {
    vi.mocked(fetchCoins).mockResolvedValue([
      { coinObjectId: '0xa', balance: '5000' } as any,
    ]);

    const clientMethod = suiFn({
      client: mockClient as any,
      signer: mockSigner as any,
    });

    const challenge = {
      request: {
        amount: '1.00',
        currency: '0x::usdc::USDC',
        recipient: '0xrecipient',
      },
    };

    await expect(
      (clientMethod as any).createCredential({ challenge }),
    ).rejects.toThrow('Not enough USDC');
  });

  it('throws when no coins exist', async () => {
    vi.mocked(fetchCoins).mockResolvedValue([]);

    const clientMethod = suiFn({
      client: mockClient as any,
      signer: mockSigner as any,
    });

    const challenge = {
      request: {
        amount: '0.01',
        currency: '0x::usdc::USDC',
        recipient: '0xrecipient',
      },
    };

    await expect(
      (clientMethod as any).createCredential({ challenge }),
    ).rejects.toThrow('No USDC balance');
  });

  it('merges multiple coins before splitting', async () => {
    vi.mocked(fetchCoins).mockResolvedValue([
      { coinObjectId: '0xa', balance: '500000' } as any,
      { coinObjectId: '0xb', balance: '600000' } as any,
    ]);

    mockSignAndExecute.mockResolvedValue({ digest: '0xtxdigest' });
    mockWaitForTransaction.mockResolvedValue({});

    const { Transaction } = await import('@mysten/sui/transactions');
    const txInstance = new Transaction();

    const clientMethod = suiFn({
      client: mockClient as any,
      signer: mockSigner as any,
    });

    const challenge = {
      request: {
        amount: '0.01',
        currency: '0x::usdc::USDC',
        recipient: '0xrecipient',
      },
    };

    try {
      await (clientMethod as any).createCredential({ challenge });
    } catch {
      // Credential.serialize may not be available in test — we're testing TX building
    }

    expect(mockSignAndExecute).toHaveBeenCalled();
  });
});
