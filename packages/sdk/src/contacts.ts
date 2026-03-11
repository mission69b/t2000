import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { validateAddress } from './utils/sui.js';
import { T2000Error } from './errors.js';

export interface Contact {
  name: string;
  address: string;
}

export type ContactMap = Record<string, Contact>;

const RESERVED_NAMES = new Set(['to', 'all', 'address']);

export class ContactManager {
  private contacts: ContactMap = {};
  private readonly filePath: string;
  private readonly dir: string;

  constructor(configDir?: string) {
    this.dir = configDir ?? join(homedir(), '.t2000');
    this.filePath = join(this.dir, 'contacts.json');
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        this.contacts = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      this.contacts = {};
    }
  }

  private save(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.contacts, null, 2));
  }

  add(name: string, address: string): { action: 'added' | 'updated' } {
    this.validateName(name);
    const normalized = validateAddress(address);
    const key = name.toLowerCase();
    const existed = key in this.contacts;
    this.contacts[key] = { name, address: normalized };
    this.save();
    return { action: existed ? 'updated' : 'added' };
  }

  remove(name: string): boolean {
    const key = name.toLowerCase();
    if (!(key in this.contacts)) return false;
    delete this.contacts[key];
    this.save();
    return true;
  }

  get(name: string): Contact | undefined {
    this.load();
    return this.contacts[name.toLowerCase()];
  }

  list(): Contact[] {
    this.load();
    return Object.values(this.contacts);
  }

  resolve(nameOrAddress: string): { address: string; contactName?: string } {
    this.load();

    if (nameOrAddress.startsWith('0x') && nameOrAddress.length >= 42) {
      return { address: validateAddress(nameOrAddress) };
    }

    const contact = this.contacts[nameOrAddress.toLowerCase()];
    if (contact) {
      return { address: contact.address, contactName: contact.name };
    }

    throw new T2000Error(
      'CONTACT_NOT_FOUND',
      `"${nameOrAddress}" is not a valid Sui address or saved contact.\n` +
      `  Add it: t2000 contacts add ${nameOrAddress} 0x...`,
    );
  }

  private validateName(name: string): void {
    if (name.startsWith('0x')) {
      throw new T2000Error('INVALID_CONTACT_NAME', 'Contact names cannot start with 0x');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new T2000Error('INVALID_CONTACT_NAME', 'Contact names can only contain letters, numbers, and underscores');
    }
    if (name.length > 32) {
      throw new T2000Error('INVALID_CONTACT_NAME', 'Contact names must be 32 characters or fewer');
    }
    if (RESERVED_NAMES.has(name.toLowerCase())) {
      throw new T2000Error('INVALID_CONTACT_NAME', `"${name}" is a reserved name and cannot be used as a contact`);
    }
  }
}
