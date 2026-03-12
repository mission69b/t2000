/**
 * Run All SDK Integration Tests
 *
 * Executes each test module sequentially via subprocess.
 * Each test is independent — failures in one don't block others.
 *
 * Usage:
 *   source .env.local && npx tsx scripts/run-all.ts
 *   source .env.local && npx tsx scripts/run-all.ts --live    # includes live sentinel attack
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIVE = process.argv.includes('--live');

const tests = [
  { name: 'Wallet & Balance', file: 'test-wallet.ts' },
  { name: 'Send', file: 'test-send.ts' },
  { name: 'NAVI Protocol', file: 'test-navi.ts' },
  { name: 'Suilend Protocol', file: 'test-suilend.ts' },
  { name: 'Swap', file: 'test-swap.ts' },
  { name: 'Earn', file: 'test-earn.ts' },
  { name: 'Investment', file: 'test-invest.ts' },
  { name: 'Sentinel', file: 'test-sentinel.ts', args: LIVE ? '--live' : '' },
  { name: 'x402 Pay', file: 'test-pay.ts' },
  { name: 'Misc', file: 'test-misc.ts' },
];

console.log('╔══════════════════════════════════════════╗');
console.log('║   t2000 SDK — Full Integration Suite     ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`\n   Tests: ${tests.length}`);
console.log(`   Mode:  ${LIVE ? 'LIVE (sentinel attack costs SUI)' : 'Standard'}\n`);

let totalPassed = 0;
let totalFailed = 0;
const results: { name: string; status: 'passed' | 'failed'; time: number }[] = [];

for (const test of tests) {
  const scriptPath = resolve(__dirname, test.file);
  const args = test.args ? ` ${test.args}` : '';
  const start = Date.now();

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Running: ${test.name}`);
  console.log(`${'═'.repeat(50)}`);

  try {
    execSync(`npx tsx ${scriptPath}${args}`, {
      stdio: 'inherit',
      env: process.env,
    });
    const elapsed = Date.now() - start;
    results.push({ name: test.name, status: 'passed', time: elapsed });
    totalPassed++;
  } catch {
    const elapsed = Date.now() - start;
    results.push({ name: test.name, status: 'failed', time: elapsed });
    totalFailed++;
  }
}

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   Summary                               ║');
console.log('╚══════════════════════════════════════════╝\n');

for (const r of results) {
  const icon = r.status === 'passed' ? '✓' : '✗';
  const time = `${(r.time / 1000).toFixed(1)}s`;
  console.log(`   ${icon} ${r.name.padEnd(25)} ${time}`);
}

console.log(`\n   ${totalPassed} passed, ${totalFailed} failed\n`);

process.exit(totalFailed > 0 ? 1 : 0);
