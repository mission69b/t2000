import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';

describe('Transaction serialization roundtrip', () => {
  it('serialize() returns a JSON string (not bytes)', () => {
    const tx = new Transaction();
    tx.setSender('0x' + 'a'.repeat(64));
    const serialized = tx.serialize();

    expect(typeof serialized).toBe('string');
    expect(() => JSON.parse(serialized)).not.toThrow();
  });

  it('Transaction.from(jsonString) reconstructs from serialize()', () => {
    const tx = new Transaction();
    tx.setSender('0x' + 'a'.repeat(64));
    const serialized = tx.serialize();

    const restored = Transaction.from(serialized);
    expect(restored).toBeInstanceOf(Transaction);
  });

  it('roundtrip preserves sender', () => {
    const address = '0x' + 'b'.repeat(64);
    const tx = new Transaction();
    tx.setSender(address);

    const serialized = tx.serialize();
    const restored = Transaction.from(serialized);
    const reserialized = restored.serialize();

    expect(JSON.parse(reserialized).sender).toBe(address);
  });

  it('Transaction.from(Buffer) treats input as BCS (NOT JSON)', () => {
    const tx = new Transaction();
    tx.setSender('0x' + 'a'.repeat(64));
    const serialized = tx.serialize();

    // Passing a Buffer (Uint8Array) makes Transaction.from try BCS deserialization
    // which fails because JSON bytes aren't valid BCS — this is the bug we fixed
    const buf = Buffer.from(serialized);
    expect(() => Transaction.from(buf)).toThrow();
  });

  it('tx.serialize() is safe to embed in JSON request body', () => {
    const tx = new Transaction();
    tx.setSender('0x' + 'c'.repeat(64));
    const serialized = tx.serialize();

    const requestBody = JSON.stringify({ txJson: serialized, sender: '0x' + 'c'.repeat(64) });
    const parsed = JSON.parse(requestBody);

    expect(typeof parsed.txJson).toBe('string');
    const restored = Transaction.from(parsed.txJson);
    expect(restored).toBeInstanceOf(Transaction);
  });
});
