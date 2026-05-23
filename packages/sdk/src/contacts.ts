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

// [S.279 / CLI-CONTACTS-CLEANUP — 2026-05-23] One-shot deprecation warning.
// `contacts.json` is the legacy CLI-only name-resolution path (predates
// SuiNS integration in T2000.send). SuiNS is now the canonical alias
// system — register `your-name.sui` on-chain instead. We warn once per
// process the first time a contact alias is actually resolved (Path 3
// in T2000.resolveRecipient). Pure-hex callers and SuiNS users see
// nothing. Sunset target: next major SDK release.
let deprecationWarned = false;
function warnContactsDeprecation(): void {
  if (deprecationWarned) return;
  deprecationWarned = true;
  console.warn(
    '[t2000] DEPRECATION: ~/.t2000/contacts.json alias resolution is deprecated and will be removed in the next major release. ' +
      'Use SuiNS names instead (e.g. `t2000 send alex.sui 10 USDC`). ' +
      'Register a SuiNS name at https://suins.io if you need a memorable handle.',
  );
}

/**
 * [S.279 — 2026-05-23] Test seam — reset the once-per-process warning
 * flag so deprecation-warning tests can run deterministically.
 */
export function _resetContactsDeprecationWarning(): void {
  deprecationWarned = false;
}

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
      // [S.279] Warn once per process. The user is relying on the
      // deprecated alias path; surface the SuiNS migration before next
      // major drops it. Pure-hex / SuiNS callers never see this.
      warnContactsDeprecation();
      return { address: contact.address, contactName: contact.name };
    }

    throw new T2000Error(
      'CONTACT_NOT_FOUND',
      `"${nameOrAddress}" is not a valid Sui address or saved contact.\n` +
      `  Use a SuiNS name (e.g. alex.sui — register at https://suins.io)\n` +
      `  or paste the full Sui address (0x... 64 hex characters).\n` +
      `  Legacy contact aliases: \`t2000 contacts add ${nameOrAddress} 0x...\` (deprecated).`,
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
