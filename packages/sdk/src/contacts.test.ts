import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContactManager } from './contacts.js';

const VALID_ADDRESS = '0x8b3e4f2a1c9d7b5e3f1a8c2d4e6f9b0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e';
const VALID_ADDRESS_2 = '0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62';

describe('ContactManager', () => {
  let dir: string;
  let manager: ContactManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't2000-contacts-test-'));
    manager = new ContactManager(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('add', () => {
    it('adds a new contact', () => {
      const result = manager.add('Tom', VALID_ADDRESS);
      expect(result.action).toBe('added');
    });

    it('updates an existing contact', () => {
      manager.add('Tom', VALID_ADDRESS);
      const result = manager.add('Tom', VALID_ADDRESS_2);
      expect(result.action).toBe('updated');
    });

    it('persists to disk', () => {
      manager.add('Tom', VALID_ADDRESS);
      const fresh = new ContactManager(dir);
      const contact = fresh.get('Tom');
      expect(contact).toBeDefined();
      expect(contact!.name).toBe('Tom');
    });

    it('rejects names starting with 0x', () => {
      expect(() => manager.add('0xHacker', VALID_ADDRESS)).toThrow('cannot start with 0x');
    });

    it('rejects names with special characters', () => {
      expect(() => manager.add('Tom!', VALID_ADDRESS)).toThrow('letters, numbers, and underscores');
    });

    it('rejects names with spaces', () => {
      expect(() => manager.add('Tom Smith', VALID_ADDRESS)).toThrow('letters, numbers, and underscores');
    });

    it('rejects names longer than 32 chars', () => {
      const long = 'a'.repeat(33);
      expect(() => manager.add(long, VALID_ADDRESS)).toThrow('32 characters or fewer');
    });

    it('rejects reserved name "to"', () => {
      expect(() => manager.add('to', VALID_ADDRESS)).toThrow('reserved name');
    });

    it('rejects reserved name "all"', () => {
      expect(() => manager.add('ALL', VALID_ADDRESS)).toThrow('reserved name');
    });

    it('rejects reserved name "address"', () => {
      expect(() => manager.add('Address', VALID_ADDRESS)).toThrow('reserved name');
    });

    it('rejects invalid Sui address', () => {
      expect(() => manager.add('Tom', 'not-an-address')).toThrow('Invalid Sui address');
    });

    it('allows underscores in names', () => {
      const result = manager.add('my_wallet', VALID_ADDRESS);
      expect(result.action).toBe('added');
    });

    it('allows numeric names', () => {
      const result = manager.add('wallet1', VALID_ADDRESS);
      expect(result.action).toBe('added');
    });

    it('rejects empty name', () => {
      expect(() => manager.add('', VALID_ADDRESS)).toThrow('letters, numbers, and underscores');
    });
  });

  describe('remove', () => {
    it('removes existing contact', () => {
      manager.add('Tom', VALID_ADDRESS);
      expect(manager.remove('Tom')).toBe(true);
      expect(manager.get('Tom')).toBeUndefined();
    });

    it('returns false for non-existent contact', () => {
      expect(manager.remove('Nobody')).toBe(false);
    });

    it('is case-insensitive', () => {
      manager.add('Tom', VALID_ADDRESS);
      expect(manager.remove('TOM')).toBe(true);
    });
  });

  describe('get', () => {
    it('returns contact by name', () => {
      manager.add('Tom', VALID_ADDRESS);
      const contact = manager.get('Tom');
      expect(contact).toBeDefined();
      expect(contact!.name).toBe('Tom');
    });

    it('is case-insensitive', () => {
      manager.add('Tom', VALID_ADDRESS);
      expect(manager.get('tom')).toBeDefined();
      expect(manager.get('TOM')).toBeDefined();
    });

    it('returns undefined for non-existent contact', () => {
      expect(manager.get('Nobody')).toBeUndefined();
    });

    it('preserves original casing', () => {
      manager.add('MyWallet', VALID_ADDRESS);
      const contact = manager.get('mywallet');
      expect(contact!.name).toBe('MyWallet');
    });
  });

  describe('list', () => {
    it('returns empty array when no contacts', () => {
      expect(manager.list()).toEqual([]);
    });

    it('returns all contacts', () => {
      manager.add('Tom', VALID_ADDRESS);
      manager.add('Alice', VALID_ADDRESS_2);
      const list = manager.list();
      expect(list).toHaveLength(2);
      expect(list.map(c => c.name).sort()).toEqual(['Alice', 'Tom']);
    });
  });

  describe('resolve', () => {
    it('resolves raw address directly', () => {
      const result = manager.resolve(VALID_ADDRESS);
      expect(result.address).toBeDefined();
      expect(result.contactName).toBeUndefined();
    });

    it('resolves contact name to address', () => {
      manager.add('Tom', VALID_ADDRESS);
      const result = manager.resolve('Tom');
      expect(result.contactName).toBe('Tom');
      expect(result.address).toBeDefined();
    });

    it('is case-insensitive for names', () => {
      manager.add('Tom', VALID_ADDRESS);
      const result = manager.resolve('tom');
      expect(result.contactName).toBe('Tom');
    });

    it('throws for unknown name', () => {
      expect(() => manager.resolve('Nobody')).toThrow('not a valid Sui address or saved contact');
    });

    it('throws with helpful add hint', () => {
      expect(() => manager.resolve('Nobody')).toThrow('t2000 contacts add Nobody');
    });

    it('validates raw addresses', () => {
      expect(() => manager.resolve('0xinvalid')).toThrow();
    });
  });

  describe('corrupted file', () => {
    it('handles corrupted JSON gracefully', () => {
      writeFileSync(join(dir, 'contacts.json'), 'not valid json!!!');
      const m = new ContactManager(dir);
      expect(m.list()).toEqual([]);
    });
  });

  describe('reload from disk', () => {
    it('picks up changes from another process', () => {
      const m1 = new ContactManager(dir);
      m1.add('Tom', VALID_ADDRESS);

      const m2 = new ContactManager(dir);
      const contact = m2.get('Tom');
      expect(contact).toBeDefined();
      expect(contact!.name).toBe('Tom');
    });
  });
});
