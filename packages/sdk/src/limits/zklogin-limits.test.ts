import { describe, expect, it, vi } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { T2000 } from '../t2000.js';
import type { ZkLoginProof } from '../wallet/zkLoginSigner.js';
import { LimitEnforcer, MemoryLimitEnforcer } from './enforce.js';

// The Connect P0 (founder dogfood 2026-08-02): on mcp.t2000.ai, pay/swap died
// with `ENOENT: mkdir '/home/sbx_user…/.t2000'` — `record()` after a SETTLED
// spend tried to write the file ledger under an unwritable serverless home.
// homedir is mocked to a path under a plain FILE, so any mkdir attempt fails
// with ENOTDIR regardless of who runs the tests (root CI included).
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const scratch = mkdtempSync(join(os.tmpdir(), 't2000-nohome-'));
  const blocker = join(scratch, 'not-a-dir');
  writeFileSync(blocker, '');
  return { ...os, homedir: () => join(blocker, 'home') };
});

function zkAgent(): T2000 {
  return T2000.fromZkLogin({
    ephemeralKeypair: new Ed25519Keypair(),
    zkProof: {} as ZkLoginProof,
    userAddress: '0x4529c9134627ada1e8bc8c4e6273573a312235a36135290be9c0a682cdfa6ecf',
    maxEpoch: 100,
  });
}

describe('fromZkLogin limits (unwritable homedir)', () => {
  it('sanity: the file enforcer DOES throw here (the mock bites)', () => {
    expect(() => new LimitEnforcer().record(1)).toThrow();
  });

  it('wires a MemoryLimitEnforcer — never touches ~/.t2000', () => {
    const agent = zkAgent();
    expect(agent.limits).toBeInstanceOf(MemoryLimitEnforcer);
  });

  it('assert + record on the pay path do not throw', () => {
    const agent = zkAgent();
    expect(() => agent.limits.assert({ operation: 'pay', amountUsd: 0.01 })).not.toThrow();
    expect(() => agent.limits.record(0.01)).not.toThrow();
    expect(agent.limits.dailySpentToday()).toBe(0.01);
  });

  it('still gates when a host opts into session caps', () => {
    const agent = zkAgent();
    agent.limits.setLimits({ perTxUsd: 5 });
    expect(() => agent.limits.assert({ operation: 'swap', amountUsd: 10 })).toThrow();
  });
});
