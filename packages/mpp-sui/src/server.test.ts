import { describe, it, expect, vi, beforeEach } from 'vitest';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const RECIPIENT = '0xrecipient_address';
const SENDER = '0xsender_address';

function buildMockTx({
  status = 'success',
  coinType = USDC_TYPE,
  recipientAddr = RECIPIENT,
  amount = '10000',
  senderAddr = SENDER,
}: {
  status?: string;
  coinType?: string;
  recipientAddr?: string;
  amount?: string;
  senderAddr?: string;
} = {}) {
  return {
    effects: { status: { status } },
    balanceChanges: [
      {
        coinType,
        owner: { AddressOwner: recipientAddr },
        amount,
      },
      {
        coinType,
        owner: { AddressOwner: senderAddr },
        amount: `-${amount}`,
      },
    ],
  };
}

function buildCredential(digest = '0xdigest123', amount = '0.01') {
  return {
    payload: { digest },
    challenge: {
      request: {
        amount,
        currency: USDC_TYPE,
        recipient: RECIPIENT,
      },
    },
  };
}

const mockGetTxBlock = vi.fn();

vi.mock('@mysten/sui/jsonRpc', () => ({
  SuiJsonRpcClient: vi.fn().mockImplementation(() => ({
    getTransactionBlock: mockGetTxBlock,
  })),
  getJsonRpcFullnodeUrl: vi.fn(() => 'https://fullnode.mainnet.sui.io'),
}));

vi.mock('@mysten/sui/utils', () => ({
  normalizeSuiAddress: vi.fn((addr: string) => addr.toLowerCase()),
}));

describe('server verify', () => {
  let suiFn: typeof import('./server.js').sui;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./server.js');
    suiFn = mod.sui;
  });

  it('accepts valid payment with correct amount', async () => {
    mockGetTxBlock.mockResolvedValue(buildMockTx());

    const serverMethod = suiFn({
      currency: USDC_TYPE,
      recipient: RECIPIENT,
    });

    const result = await (serverMethod as any).verify({
      credential: buildCredential(),
    });

    expect(result.reference).toBe('0xdigest123');
    expect(result.status).toBe('success');
  });

  it('rejects failed transaction', async () => {
    mockGetTxBlock.mockResolvedValue(buildMockTx({ status: 'failure' }));

    const serverMethod = suiFn({
      currency: USDC_TYPE,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Transaction failed on-chain');
  });

  it('rejects when payment not sent to recipient', async () => {
    mockGetTxBlock.mockResolvedValue(
      buildMockTx({ recipientAddr: '0xwrong_address' }),
    );

    const serverMethod = suiFn({
      currency: USDC_TYPE,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Payment not found');
  });

  it('rejects when amount is less than requested', async () => {
    mockGetTxBlock.mockResolvedValue(buildMockTx({ amount: '5000' }));

    const serverMethod = suiFn({
      currency: USDC_TYPE,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Transferred');
  });

  it('rejects when no balance changes', async () => {
    mockGetTxBlock.mockResolvedValue({
      effects: { status: { status: 'success' } },
      balanceChanges: [],
    });

    const serverMethod = suiFn({
      currency: USDC_TYPE,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Payment not found');
  });
});
