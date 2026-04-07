import { describe, it, expect, vi, afterEach } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { buildScopedIntent, verifyScopedIntent } from './intent-builder.js';
import { ALLOWANCE_FEATURES } from '../constants.js';

const FAKE_USER = {
  userId: 'user_abc123',
  walletAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  allowanceObjectId: '0xaaaa',
  featureCode: ALLOWANCE_FEATURES.AUTO_COMPOUND as typeof ALLOWANCE_FEATURES.AUTO_COMPOUND,
  maxAmount: 10_000,
};

describe('intent-builder', () => {
  const keypair = new Ed25519Keypair();
  const publicKeyBytes = keypair.getPublicKey().toRawBytes();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildScopedIntent', () => {
    it('produces a valid intent with correct fields', async () => {
      const intent = await buildScopedIntent(keypair, FAKE_USER);

      expect(intent.version).toBe(1);
      expect(intent.userId).toBe(FAKE_USER.userId);
      expect(intent.walletAddress).toBe(FAKE_USER.walletAddress);
      expect(intent.allowanceObjectId).toBe(FAKE_USER.allowanceObjectId);
      expect(intent.featureCode).toBe(FAKE_USER.featureCode);
      expect(intent.maxAmount).toBe(FAKE_USER.maxAmount);
      expect(intent.nonce).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(intent.signature).toBeTruthy();
      expect(intent.expiresAt).toBeGreaterThan(intent.issuedAt);
    });

    it('defaults to 60s TTL', async () => {
      const intent = await buildScopedIntent(keypair, FAKE_USER);
      expect(intent.expiresAt - intent.issuedAt).toBe(60_000);
    });

    it('respects custom TTL', async () => {
      const intent = await buildScopedIntent(keypair, { ...FAKE_USER, ttlMs: 30_000 });
      expect(intent.expiresAt - intent.issuedAt).toBe(30_000);
    });

    it('generates unique nonces', async () => {
      const a = await buildScopedIntent(keypair, FAKE_USER);
      const b = await buildScopedIntent(keypair, FAKE_USER);
      expect(a.nonce).not.toBe(b.nonce);
    });
  });

  describe('verifyScopedIntent', () => {
    it('verifies a freshly built intent', async () => {
      const intent = await buildScopedIntent(keypair, FAKE_USER);
      const valid = await verifyScopedIntent(intent, publicKeyBytes);
      expect(valid).toBe(true);
    });

    it('rejects an expired intent', async () => {
      const intent = await buildScopedIntent(keypair, { ...FAKE_USER, ttlMs: 1 });
      // Wait for it to expire
      await new Promise((r) => setTimeout(r, 10));
      const valid = await verifyScopedIntent(intent, publicKeyBytes);
      expect(valid).toBe(false);
    });

    it('rejects a tampered payload', async () => {
      const intent = await buildScopedIntent(keypair, FAKE_USER);
      const tampered = { ...intent, maxAmount: 999_999 };
      const valid = await verifyScopedIntent(tampered, publicKeyBytes);
      expect(valid).toBe(false);
    });

    it('rejects a different public key', async () => {
      const intent = await buildScopedIntent(keypair, FAKE_USER);
      const wrongKeypair = new Ed25519Keypair();
      const wrongPubBytes = wrongKeypair.getPublicKey().toRawBytes();
      const valid = await verifyScopedIntent(intent, wrongPubBytes);
      expect(valid).toBe(false);
    });

    it('rejects a corrupted signature', async () => {
      const intent = await buildScopedIntent(keypair, FAKE_USER);
      const corrupted = { ...intent, signature: intent.signature.replace(/^.{4}/, 'dead') };
      const valid = await verifyScopedIntent(corrupted, publicKeyBytes);
      expect(valid).toBe(false);
    });

    it('rejects a tampered nonce', async () => {
      const intent = await buildScopedIntent(keypair, FAKE_USER);
      const tampered = { ...intent, nonce: '0'.repeat(64) };
      const valid = await verifyScopedIntent(tampered, publicKeyBytes);
      expect(valid).toBe(false);
    });
  });
});
