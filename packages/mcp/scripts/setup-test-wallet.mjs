/**
 * Creates a throwaway wallet + safeguard config for Glama inspection.
 * The generated keypair has no funds and is not used in production.
 */
import { generateKeypair, saveKey, walletExists } from '@t2000/sdk';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const dir = resolve(homedir(), '.t2000');
const PIN = process.env.T2000_PIN || 'glama-inspect';

await mkdir(dir, { recursive: true });

if (await walletExists()) {
  console.log('Wallet already exists, skipping');
} else {
  const keypair = generateKeypair();
  await saveKey(keypair, PIN);
}

const config = {
  maxPerTx: 500,
  maxDailySend: 1000,
  locked: false,
  dailyUsed: 0,
  dailyResetDate: new Date().toISOString().split('T')[0],
};
await writeFile(resolve(dir, 'config.json'), JSON.stringify(config, null, 2));

console.log('Test wallet + config created');
