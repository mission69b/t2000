// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 6 — 2026-05-26]
// CLI integration smokes — spawn the dist binary as a child process and
// assert on stdout / stderr / exit codes. Covers the full v4 surface
// end-to-end at the wiring layer; unit tests cover the helpers.
//
// All tests use a tmp HOME so they don't touch the founder's wallet
// (~/.t2000/wallet.key). `os.homedir()` honors `HOME` env on macOS +
// Linux, so passing HOME=<tmp> redirects every `~/.t2000/...` read +
// write inside the spawned process.
//
// Tests skip cleanly if `dist/index.js` doesn't exist — run
// `pnpm --filter @t2000/cli build` once before this file picks them up.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const distBuilt = existsSync(CLI);
const describeOrSkip = distBuilt ? describe : describe.skip;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runCli(args: string[], opts: { home?: string; env?: NodeJS.ProcessEnv } = {}): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env };
  if (opts.home) env.HOME = opts.home;
  const result = spawnSync('node', [CLI, ...args], { env, encoding: 'utf-8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? -1,
  };
}

function mkTmpHome(): string {
  return mkdtempSync(join(tmpdir(), 'cli-int-'));
}

describeOrSkip('CLI integration — wiring + version + help', () => {
  it('--version prints the package semver', () => {
    const r = runCli(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help lists every v4 command (6 singletons + 8 groups)', () => {
    const r = runCli(['--help']);
    expect(r.code).toBe(0);
    for (const cmd of [
      'init',
      'export',
      'fund',
      'status',
      'balance',
      'history',
      'send',
      'swap',
      'pay',
      'services',
      'limit',
      'mcp',
      'skills',
    ]) {
      expect(r.stdout).toContain(cmd);
    }
  });

  it('--help does NOT mention any deleted legacy command', () => {
    const r = runCli(['--help']);
    expect(r.code).toBe(0);
    for (const dead of [
      'save',
      'withdraw',
      'borrow',
      'repay',
      'health',
      'rates',
      'positions',
      'earnings',
      'fund-status',
      'lock',
      'serve',
      'config',
      'contacts',
      'export-key',
      'import-key',
      'swap-quote',
      'claim-rewards',
      'task',
    ]) {
      // Match command-table rows, not the brand or "fund" inside other
      // copy — every legacy cmd row would have surrounding whitespace.
      expect(r.stdout).not.toMatch(new RegExp(`^\\s+${dead}\\s`, 'm'));
    }
  });
});

describeOrSkip('CLI integration — bulk-deleted legacy commands all exit 1', () => {
  const deleted = [
    'save',
    'withdraw',
    'borrow',
    'repay',
    'health',
    'rates',
    'positions',
    'earnings',
    'fund-status',
    'earn',
    'lock',
    'serve',
    'config',
    'contacts',
    'export-key',
    'import-key',
    'swap-quote',
    'claim-rewards',
    'address',
    'wallet',
    'task',
  ];

  for (const cmd of deleted) {
    it(`t2 ${cmd} -> unknown command`, () => {
      const r = runCli([cmd]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(`unknown command '${cmd}'`);
    });
  }
});

describeOrSkip('CLI integration — init + fund + export round-trip', () => {
  let home: string;
  let keyPath: string;

  beforeAll(() => {
    home = mkTmpHome();
    keyPath = join(home, '.t2000', 'wallet.key');
  });

  afterAll(() => {
    if (home) rmSync(home, { recursive: true, force: true });
  });

  it('t2 init --json creates a fresh Bech32 wallet', () => {
    // --no-register: keep the test offline + deterministic (don't hit the
    // network / register a throwaway wallet on mainnet).
    const r = runCli(['--json', 'init', '--no-register'], { home });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.address).toMatch(/^0x[0-9a-f]{64}$/);
    expect(parsed.imported).toBe(false);
    expect(existsSync(keyPath)).toBe(true);
  });

  it('t2 init refuses to overwrite an existing wallet', () => {
    const r = runCli(['init', '--no-register'], { home });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Wallet already exists/i);
  });

  it('t2 fund --json prints the same address as init', () => {
    const init = runCli(['--json', 'fund'], { home });
    expect(init.code).toBe(0);
    const parsed = JSON.parse(init.stdout);
    expect(parsed.address).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('t2 fund --json is deterministic (same call twice -> same output)', () => {
    // Cheap stability check; the network-touching `t2 balance` is
    // covered by the runbook (it hits Sui RPC). This guard catches any
    // regression where address derivation becomes non-deterministic
    // (e.g., adding a timestamp to the JSON payload by accident).
    const a = runCli(['--json', 'fund'], { home });
    const b = runCli(['--json', 'fund'], { home });
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });

  it('t2 export --yes prints a suiprivkey1 secret', () => {
    const r = runCli(['export', '--yes'], { home });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/suiprivkey1[a-z0-9]+/);
  });

  it('t2 init --import <bech32> recreates the same address (S.338 restore)', () => {
    // Extract the secret from the just-exported wallet.
    const exp = runCli(['export', '--yes'], { home });
    const secret = exp.stdout.match(/suiprivkey1[a-z0-9]+/)?.[0];
    expect(secret).toBeTruthy();

    const home2 = mkTmpHome();
    try {
      const r = runCli(['--json', 'init', '--import', secret!, '--no-register'], {
        home: home2,
      });
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.imported).toBe(true);
      expect(parsed.address).toMatch(/^0x[0-9a-f]{64}$/);

      // Same secret -> same address as the original wallet.
      const originalAddr = runCli(['--json', 'fund'], { home });
      const importedAddr = runCli(['--json', 'fund'], { home: home2 });
      expect(JSON.parse(originalAddr.stdout).address).toBe(
        JSON.parse(importedAddr.stdout).address,
      );
    } finally {
      rmSync(home2, { recursive: true, force: true });
    }
  });

  it('t2 init --import refuses to overwrite an existing wallet', () => {
    const r = runCli(['init', '--import', 'suiprivkey1xxx', '--no-register'], {
      home,
    });
    expect(r.code).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/already exists/i);
  });
});

describeOrSkip('CLI integration — limit set / show / reset round-trip', () => {
  let home: string;

  beforeAll(() => {
    home = mkTmpHome();
  });

  afterAll(() => {
    if (home) rmSync(home, { recursive: true, force: true });
  });

  it('t2 limit show prints "No spending limits set." on a fresh config', () => {
    const r = runCli(['limit', 'show'], { home });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/No spending limits set/i);
  });

  it('t2 --json limit show emits { configured: false } on a fresh config', () => {
    const r = runCli(['--json', 'limit', 'show'], { home });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.configured).toBe(false);
    expect(parsed.limits).toBeNull();
  });

  it('t2 limit set (no flag) -> exits 1 with validation error', () => {
    const r = runCli(['limit', 'set'], { home });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/per-tx|daily|at least one/i);
  });

  it('t2 limit set --per-tx 0 -> exits 1 (must be positive)', () => {
    const r = runCli(['limit', 'set', '--per-tx', '0'], { home });
    expect(r.code).toBe(1);
  });

  it('t2 limit set --per-tx abc -> exits 1 (non-numeric)', () => {
    const r = runCli(['limit', 'set', '--per-tx', 'abc'], { home });
    expect(r.code).toBe(1);
  });

  it('t2 limit set --per-tx 50 succeeds + limit show reports it', () => {
    const setR = runCli(['limit', 'set', '--per-tx', '50'], { home });
    expect(setR.code).toBe(0);

    const showR = runCli(['--json', 'limit', 'show'], { home });
    const parsed = JSON.parse(showR.stdout);
    expect(parsed.configured).toBe(true);
    expect(parsed.limits.perTxUsd).toBe(50);
  });

  it('t2 limit set --daily 100 ADDs to existing per-tx limit', () => {
    const setR = runCli(['limit', 'set', '--daily', '100'], { home });
    expect(setR.code).toBe(0);

    const showR = runCli(['--json', 'limit', 'show'], { home });
    const parsed = JSON.parse(showR.stdout);
    expect(parsed.limits.perTxUsd).toBe(50);
    expect(parsed.limits.dailyUsd).toBe(100);
  });

  it('t2 limit reset clears every limit', () => {
    const resetR = runCli(['limit', 'reset'], { home });
    expect(resetR.code).toBe(0);

    const showR = runCli(['--json', 'limit', 'show'], { home });
    const parsed = JSON.parse(showR.stdout);
    expect(parsed.configured).toBe(false);
  });

  it('t2 limit reset is idempotent (second call says "nothing to clear")', () => {
    const r = runCli(['limit', 'reset'], { home });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/nothing to clear|already/i);
  });
});

describeOrSkip('CLI integration — mcp install + uninstall round-trip', () => {
  let home: string;

  beforeAll(() => {
    home = mkTmpHome();
  });

  afterAll(() => {
    if (home) rmSync(home, { recursive: true, force: true });
  });

  it('t2 --json mcp install writes the t2 entry to every platform', () => {
    const r = runCli(['--json', 'mcp', 'install'], { home });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.installed)).toBe(true);
    const slugs = parsed.installed.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain('claude-desktop');
    expect(slugs).toContain('cursor');
    expect(slugs).toContain('windsurf');
    for (const p of parsed.installed) {
      expect(p.status).toBe('added');
    }
  });

  it('t2 mcp install is idempotent — second call reports "exists"', () => {
    const r = runCli(['--json', 'mcp', 'install'], { home });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    for (const p of parsed.installed) {
      expect(p.status).toBe('exists');
    }
  });

  it('written config has command:t2000 + args:[mcp, start]', () => {
    // Pre-Phase-C: bin is `t2000`, not `t2`. The MCP entry must use the
    // bin name that's actually on PATH after `npm install -g @t2000/cli`.
    const cursorConfig = join(home, '.cursor', 'mcp.json');
    expect(existsSync(cursorConfig)).toBe(true);
    const raw = readFileSync(cursorConfig, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.t2000.command).toBe('t2000');
    expect(parsed.mcpServers.t2000.args).toEqual(['mcp', 'start']);
  });

  it('t2 mcp uninstall removes the entry from every platform', () => {
    const r = runCli(['--json', 'mcp', 'uninstall'], { home });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    for (const p of parsed.uninstalled) {
      expect(p.removed).toBe(true);
    }
  });

  it('mcp uninstall preserves sibling MCP entries', () => {
    const cursorConfig = join(home, '.cursor', 'mcp.json');
    mkdirSync(dirname(cursorConfig), { recursive: true });
    writeFileSync(
      cursorConfig,
      JSON.stringify({
        mcpServers: {
          siblingServer: { command: 'other', args: ['foo'] },
          t2000: { command: 't2000', args: ['mcp', 'start'] },
        },
      }),
    );

    const r = runCli(['--json', 'mcp', 'uninstall'], { home });
    expect(r.code).toBe(0);

    const raw = readFileSync(cursorConfig, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.t2000).toBeUndefined();
    expect(parsed.mcpServers.siblingServer).toEqual({ command: 'other', args: ['foo'] });
  });
});

describeOrSkip('CLI integration — services + skills arg validation', () => {
  it('t2 services search (no query) exits 1', () => {
    const r = runCli(['services', 'search']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/required|missing/i);
  });

  it('t2 services inspect (no url) exits 1', () => {
    const r = runCli(['services', 'inspect']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/required|missing/i);
  });

  it('t2 send (no args) exits 1', () => {
    const r = runCli(['send']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/required|missing|amount/i);
  });

  it('t2 swap (no args) exits 1', () => {
    const r = runCli(['swap']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/required|missing/i);
  });

  it('t2 pay (no url) exits 1', () => {
    const r = runCli(['pay']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/required|missing/i);
  });
});

describeOrSkip('CLI integration — help on every group resolves cleanly', () => {
  const groups = [
    ['send'],
    ['swap'],
    ['pay'],
    ['services'],
    ['services', 'search'],
    ['services', 'inspect'],
    ['limit'],
    ['limit', 'show'],
    ['limit', 'set'],
    ['limit', 'reset'],
    ['mcp'],
    ['mcp', 'install'],
    ['mcp', 'uninstall'],
    ['mcp', 'start'],
    ['skills'],
    ['skills', 'list'],
    ['skills', 'install'],
    ['skills', 'uninstall'],
  ];

  for (const path of groups) {
    it(`t2 ${path.join(' ')} --help exits 0`, () => {
      const r = runCli([...path, '--help']);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('Usage:');
    });
  }

  it('every group --help is t2000-verb-free', () => {
    // We changed the canonical binary word from t2000 to t2 in Phase C
    // examples already; help text in every group should already reflect
    // the rename (Day 5 scrub) — this is the regression gate.
    const offenders: string[] = [];
    for (const path of groups) {
      const r = runCli([...path, '--help']);
      // Look for "t2000 <verb>" patterns specifically — the brand word
      // "t2000" appearing alone (e.g. in URLs, brand copy) is fine.
      const stray = r.stdout.match(/\bt2000\s+(send|swap|pay|init|export|fund|status|balance|history|services|limit|mcp|skills)\b/g);
      if (stray && stray.length > 0) {
        offenders.push(`${path.join(' ')}: ${stray.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// [SPEC_AGENT_WALLET_GREENFIELD Phase C — S.340 — 2026-05-26]
// Verifies the publish-shape `bin` map in `package.json` so the v4.0.0
// release ships BOTH `t2` (new canonical) and `t2000` (legacy alias) as
// entry points. The test reads the on-disk manifest — the same file npm
// publishes — so this is the source of truth for "what gets symlinked
// when a user runs `npm install -g @t2000/cli`".
describe('CLI integration — Phase C bin map (t2 + t2000 dual entry)', () => {
  const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    bin?: Record<string, string>;
  };

  it('exposes both `t2` and `t2000` bins', () => {
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin?.t2).toBe('./dist/index.js');
    expect(pkg.bin?.t2000).toBe('./dist/index.js');
  });

  it('both bins point at the same dist entry (no drift)', () => {
    expect(pkg.bin?.t2).toEqual(pkg.bin?.t2000);
  });
});
