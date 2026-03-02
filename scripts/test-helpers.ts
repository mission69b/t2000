/**
 * Shared test helpers for t2000 integration tests.
 *
 * Usage:
 *   import { assert, section, runSection, createAgent, summary } from './test-helpers.js';
 */

import { T2000 } from '../packages/sdk/src/index.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

export function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`   ✓ ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.log(`   ✗ ${msg}`);
    failed++;
    failures.push(msg);
  }
}

export function section(name: string): void {
  console.log(`\n── ${name} ──`);
}

export async function runSection<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  section(name);
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`   ✗ SECTION FAILED: ${msg.slice(0, 200)}`);
    failed++;
    failures.push(`${name}: ${msg.slice(0, 200)}`);
    return null;
  }
}

export function createAgent(): T2000 {
  const key = process.env.T2000_PASSPHRASE ?? process.env.T2000_PIN;
  if (!key) {
    console.error('Set T2000_PASSPHRASE or T2000_PIN in .env.local');
    process.exit(1);
  }
  return T2000.fromPrivateKey(key);
}

export function getPrivateKey(): string {
  const key = process.env.T2000_PASSPHRASE ?? process.env.T2000_PIN;
  if (!key) {
    console.error('Set T2000_PASSPHRASE or T2000_PIN in .env.local');
    process.exit(1);
  }
  return key;
}

export function summary(testName: string): void {
  console.log('\n════════════════════════════════════════════');
  console.log(`  ${testName}: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\n  Failures:');
    for (const f of failures) {
      console.log(`    ✗ ${f}`);
    }
  }
  console.log();
}

export function exitCode(): number {
  return failed > 0 ? 1 : 0;
}

export function getStats() {
  return { passed, failed, failures: [...failures] };
}

export function resetStats(): void {
  passed = 0;
  failed = 0;
  failures.length = 0;
}
