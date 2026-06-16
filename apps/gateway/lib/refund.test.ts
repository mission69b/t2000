import { afterEach, describe, expect, it, vi } from 'vitest';

// Mutable mock env + keypair address (hoisted so the vi.mock factories can
// close over them). `constants.TREASURY_ADDRESS` is captured from env at
// module load (a `const`), so the default here is what the key must match;
// `kp.addr` is the address the mocked keypair derives (mutate it to simulate
// a key/address mismatch).
const { mockEnv, kp } = vi.hoisted(() => ({
  mockEnv: {
    TREASURY_PRIVATE_KEY: undefined as string | undefined,
    TREASURY_ADDRESS: '0xtreasury' as string | undefined,
  },
  kp: { addr: '0xtreasury' },
}));
vi.mock('./env', () => ({ env: mockEnv }));

// Capture the moveCall(s) the refund builds.
const moveCalls: Array<{ target: string; typeArguments?: string[]; arguments?: unknown[] }> = [];

vi.mock('@mysten/sui/cryptography', () => ({
  decodeSuiPrivateKey: (_: string) => ({ schema: 'ED25519', secretKey: new Uint8Array(32) }),
}));
vi.mock('@mysten/sui/keypairs/ed25519', () => ({
  Ed25519Keypair: {
    fromSecretKey: () => ({
      toSuiAddress: () => kp.addr,
      signTransaction: vi.fn(async () => ({ signature: 'treasury-sig' })),
    }),
  },
}));
vi.mock('@mysten/sui/grpc', () => ({
  SuiGrpcClient: class {
    constructor(_: unknown) {}
    core = {
      executeTransaction: vi.fn(async () => ({
        $kind: 'Transaction',
        Transaction: { digest: '0xrefunddigest' },
      })),
    };
  },
}));
vi.mock('@mysten/sui/transactions', () => ({
  Transaction: class {
    pure = { address: (a: string) => ({ addr: a }) };
    setSender(_: string) {}
    balance(b: unknown) {
      return b;
    }
    moveCall(m: { target: string; typeArguments?: string[]; arguments?: unknown[] }) {
      moveCalls.push(m);
    }
    async build() {
      return new Uint8Array([1, 2, 3]);
    }
  },
}));

import { refundUsdc, refundsEnabled, __resetTreasury } from './refund.js';

const VALID_KEY = 'suiprivkey1qreallyanythingsincedecodeIsMocked';

afterEach(() => {
  moveCalls.length = 0;
  mockEnv.TREASURY_PRIVATE_KEY = undefined;
  kp.addr = '0xtreasury';
  __resetTreasury();
});

describe('refundsEnabled', () => {
  it('false when no treasury key is configured', () => {
    mockEnv.TREASURY_PRIVATE_KEY = undefined;
    __resetTreasury();
    expect(refundsEnabled()).toBe(false);
  });
  it('true when a valid treasury key is configured', () => {
    mockEnv.TREASURY_PRIVATE_KEY = VALID_KEY;
    __resetTreasury();
    expect(refundsEnabled()).toBe(true);
  });
  it('false when the key controls a different address than TREASURY_ADDRESS', () => {
    mockEnv.TREASURY_PRIVATE_KEY = VALID_KEY;
    kp.addr = '0xsomeotherwallet'; // key/address mismatch — must fail closed
    __resetTreasury();
    expect(refundsEnabled()).toBe(false);
  });
});

describe('refundUsdc', () => {
  it('throws when no treasury key is configured', async () => {
    mockEnv.TREASURY_PRIVATE_KEY = undefined;
    __resetTreasury();
    await expect(refundUsdc({ payer: '0xpayer', amount: '0.02', network: 'mainnet' })).rejects.toThrow(
      /not configured/i,
    );
  });

  it('builds a gasless USDC send_funds(amount → payer) and returns the digest', async () => {
    mockEnv.TREASURY_PRIVATE_KEY = VALID_KEY;
    __resetTreasury();
    const digest = await refundUsdc({ payer: '0xpayer', amount: '0.02', network: 'mainnet' });
    expect(digest).toBe('0xrefunddigest');

    expect(moveCalls).toHaveLength(1);
    const call = moveCalls[0];
    expect(call.target).toBe('0x2::balance::send_funds');
    expect(call.typeArguments?.[0]).toMatch(/::usdc::USDC$/i);
    // arg0 = balance({ type, balance: atomic }); arg1 = pure.address(payer)
    expect((call.arguments?.[0] as { balance: bigint }).balance).toBe(BigInt(20000)); // 0.02 * 1e6
    expect((call.arguments?.[1] as { addr: string }).addr).toBe('0xpayer');
  });

  it('floors the refund amount to USDC atomic units (never over-refunds)', async () => {
    mockEnv.TREASURY_PRIVATE_KEY = VALID_KEY;
    __resetTreasury();
    await refundUsdc({ payer: '0xp', amount: '0.0299999', network: 'mainnet' });
    expect((moveCalls[0].arguments?.[0] as { balance: bigint }).balance).toBe(BigInt(29999)); // floor(0.0299999*1e6)
  });

  it('rejects a non-positive amount', async () => {
    mockEnv.TREASURY_PRIVATE_KEY = VALID_KEY;
    __resetTreasury();
    await expect(refundUsdc({ payer: '0xp', amount: '0', network: 'mainnet' })).rejects.toThrow(/invalid refund/i);
  });
});
