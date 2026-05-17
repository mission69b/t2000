#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/smoke-6g.mjs — end-to-end smoke test for 6G prompt composition
// ---------------------------------------------------------------------------
//
// Spawns the BUILT MCP server (`dist/bin.js`), speaks JSON-RPC over
// stdio, calls `prompts/get` for each of the 14 workflow prompts, and
// asserts the rendered text contains BOTH the workflow framing AND
// substantive content from the composed skill(s).
//
// Run after `pnpm --filter @t2000/mcp build`. CI invokes this via
// `pnpm --filter @t2000/mcp test:smoke` (script TBD — for now it's a
// manual one-shot before publishing v2.4.0).
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BIN = join(__dirname, '..', 'dist', 'bin.js');

// Per-prompt assertions: framing phrase + at least one skill-derived
// substring. The skill substrings are stable lines from SKILL.md
// `## Purpose` / `## Engine orchestration` / etc.
const ASSERTIONS = [
  { name: 'financial-report', framing: 'RECOMMENDATIONS', skill: 'Render a complete account snapshot' },
  { name: 'optimize-yield', framing: 'YIELD ANALYSIS', skill: 'USDC' },
  { name: 'savings-strategy', framing: 'savings advisor', skill: 'USDC' },
  { name: 'sweep', framing: 'SWEEP PLAN', skill: 'USDC' },
  { name: 'risk-check', framing: 'RISK REPORT', skill: 'health factor' },
  { name: 'weekly-recap', framing: 'WEEKLY RECAP', skill: 'balance_check' },
  { name: 'send-money', framing: 'CANONICAL SEND FLOW', skill: 'Pre-flight checks' },
  { name: 'budget-check', framing: 'budget advisor', skill: 'maxPerTx' },
  { name: 'what-if', framing: 'SCENARIO', skill: 'Pre-borrow safety check' },
  { name: 'claim-rewards', framing: 't2000_pending_rewards', skill: 't2000_harvest_rewards' },
  { name: 'safeguards', framing: 'security advisor', skill: 'maxPerTx' },
  { name: 'onboarding', framing: 'WELCOME TO T2000', skill: 'payment request' },
  { name: 'emergency', framing: 'EMERGENCY PROTOCOL', skill: 'maxPerTx' },
  { name: 'optimize-all', framing: 'FULL OPTIMIZATION', skill: 'USDC' },
];

// JSON-RPC client over stdio.
class StdioClient {
  constructor(proc) {
    this.proc = proc;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
    proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      let i;
      while ((i = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(`RPC error: ${JSON.stringify(msg.error)}`));
            else resolve(msg.result);
          }
        } catch (e) {
          // Non-JSON line — ignore (server may log to stderr but also stdout banner).
        }
      }
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(req);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout: ${method}`));
        }
      }, 10000);
    });
  }
}

async function main() {
  const proc = spawn('node', [BIN], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, T2000_SKIP_GATE: '1' }, // bypass safeguard gate
  });

  // Capture stderr for debug.
  let stderr = '';
  proc.stderr.on('data', (c) => { stderr += c.toString('utf8'); });

  const client = new StdioClient(proc);

  try {
    await client.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-6g', version: '0.0.1' },
    });
    await client.call('notifications/initialized', {}).catch(() => {});

    const list = await client.call('prompts/list', {});
    const names = list.prompts.map((p) => p.name);

    let failed = 0;
    for (const { name, framing, skill } of ASSERTIONS) {
      if (!names.includes(name)) {
        console.error(`✗ ${name} — NOT REGISTERED`);
        failed++;
        continue;
      }

      const result = await client.call('prompts/get', { name, arguments: {} });
      const text = result.messages[0].content.text;

      const hasFraming = text.includes(framing);
      const hasSkill = text.includes(skill);
      if (hasFraming && hasSkill) {
        console.log(`✓ ${name}`);
      } else {
        console.error(`✗ ${name}`);
        if (!hasFraming) console.error(`   missing framing: '${framing}'`);
        if (!hasSkill) console.error(`   missing skill substance: '${skill}'`);
        failed++;
      }
    }

    // Also check `skill-*` auto-registered prompts are still there.
    const skillPrompts = names.filter((n) => n.startsWith('skill-'));
    if (skillPrompts.length !== 14) {
      console.error(`✗ expected 14 skill-* prompts, got ${skillPrompts.length}`);
      failed++;
    } else {
      console.log(`✓ ${skillPrompts.length} skill-* auto-prompts registered`);
    }

    console.log('');
    if (failed > 0) {
      console.error(`FAILED: ${failed} / ${ASSERTIONS.length + 1}`);
      console.error('\nstderr:');
      console.error(stderr);
      process.exitCode = 1;
    } else {
      console.log(`PASSED: ${ASSERTIONS.length + 1} / ${ASSERTIONS.length + 1}`);
    }
  } finally {
    proc.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
