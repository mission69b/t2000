import { describe, it, expect } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { KeypairSigner } from './keypairSigner.js';

describe('KeypairSigner', () => {
  const keypair = new Ed25519Keypair();
  const signer = new KeypairSigner(keypair);

  it('getAddress returns the keypair Sui address', () => {
    const expected = keypair.getPublicKey().toSuiAddress();
    expect(signer.getAddress()).toBe(expected);
  });

  it('implements TransactionSigner interface', () => {
    expect(typeof signer.getAddress).toBe('function');
    expect(typeof signer.signTransaction).toBe('function');
  });

  it('signTransaction returns a signature string', async () => {
    const txBytes = new Uint8Array(32).fill(1);
    const result = await signer.signTransaction(txBytes);
    expect(result).toHaveProperty('signature');
    expect(typeof result.signature).toBe('string');
    expect(result.signature.length).toBeGreaterThan(0);
  });

  it('getKeypair returns the underlying keypair', () => {
    expect(signer.getKeypair()).toBe(keypair);
  });

  it('different keypairs produce different addresses', () => {
    const other = new KeypairSigner(new Ed25519Keypair());
    expect(other.getAddress()).not.toBe(signer.getAddress());
  });

  it('same keypair produces same address consistently', () => {
    const addr1 = signer.getAddress();
    const addr2 = signer.getAddress();
    expect(addr1).toBe(addr2);
  });
});
