/**
 * Treasury separation ceremony (S.627 / RUNBOOK_S627) — derive the three
 * separated wallets from a FRESH ops mnemonic (never the seed-agents one):
 *
 *   index 0 → REVENUE  (ours: service payments + commerce fees; key stays
 *                       offline — the gateway never spends it)
 *   index 1 → ESCROW   (customer funds in flight; the gateway's hot spender —
 *                       its key goes to Vercel as ESCROW_PRIVATE_KEY)
 *   index 2 → CREDITS  (top-up deposit liabilities; key stays offline — set
 *                       the ADDRESS as audric web-v3's T2000_TREASURY)
 *
 * Usage:
 *   npx tsx apps/gateway/scripts/treasury-wallets.mts init   # generate + print
 *   npx tsx apps/gateway/scripts/treasury-wallets.mts show   # re-print from the mnemonic
 *
 * BACK UP ~/.t2000/treasury-ops.mnemonic OFFLINE. TWICE. It derives all three.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const MNEMONIC_PATH = join(homedir(), '.t2000', 'treasury-ops.mnemonic');

const WALLETS = [
  { index: 0, name: 'REVENUE', hot: false },
  { index: 1, name: 'ESCROW', hot: true },
  { index: 2, name: 'CREDITS', hot: false },
] as const;

function mnemonicFor(cmd: string): string {
  if (existsSync(MNEMONIC_PATH)) {
    return readFileSync(MNEMONIC_PATH, 'utf8').trim();
  }
  if (cmd !== 'init') {
    console.error(`No mnemonic at ${MNEMONIC_PATH} — run \`init\` first.`);
    process.exit(1);
  }
  const mnemonic = bip39.generateMnemonic(wordlist, 256);
  writeFileSync(MNEMONIC_PATH, `${mnemonic}\n`, { mode: 0o600 });
  console.log(`NEW ops mnemonic written to ${MNEMONIC_PATH}`);
  console.log('BACK IT UP OFFLINE, TWICE — it derives REVENUE + ESCROW + CREDITS.\n');
  return mnemonic;
}

const cmd = process.argv[2] ?? 'show';
if (!['init', 'show'].includes(cmd)) {
  console.error('Usage: treasury-wallets.mts init|show');
  process.exit(1);
}
const mnemonic = mnemonicFor(cmd);

console.log('S.627 separated treasury wallets\n');
const lines: string[] = [];
for (const w of WALLETS) {
  const kp = Ed25519Keypair.deriveKeypair(mnemonic, `m/44'/784'/${w.index}'/0'/0'`);
  const address = kp.getPublicKey().toSuiAddress();
  console.log(`${w.name.padEnd(8)} ${address}${w.hot ? '   (hot — key goes to Vercel)' : '   (key stays offline)'}`);
  if (w.hot) {
    const keyFile = join(homedir(), '.t2000', 'treasury-escrow.key');
    writeFileSync(keyFile, `${kp.getSecretKey()}\n`, { mode: 0o600 });
    lines.push(`ESCROW_PRIVATE_KEY → the Bech32 secret in ${keyFile} (0600)`);
  }
  lines.push(
    w.name === 'CREDITS'
      ? `T2000_TREASURY=${address}   (audric web-v3 project — the top-up deposit address)`
      : `${w.name}_ADDRESS=${address}   (gateway project)`,
  );
}

console.log('\nVercel env to set:');
for (const l of lines) {
  console.log(`  ${l}`);
}
console.log(
  '\nThen: verify each address receives (send $0.10 to each) → deploy → run the RUNBOOK_S627 verification matrix → one-time balance split per the ledgers.',
);
