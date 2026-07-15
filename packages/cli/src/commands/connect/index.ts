// [SPEC_INFERENCE_DEMAND Step 1 item 1 — un-HELD 2026-07-16]
// `t2 connect [client]` — point a coding tool at Private Inference
// (api.t2000.ai/v1) with a console key. The headline target is t2 code;
// ccr / Continue / aider / Codex / Cline / Cursor ride along.
//
// The one key path (§1d): the key comes from the console
// (agents.t2000.ai/manage), pasted here via --key (or already in
// T2000_API_KEY / a prior save). We persist it to ~/.t2000/config.json so
// subsequent connects don't re-ask.

import type { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  API_BASE,
  CONNECT_CLIENTS,
  CONSOLE_KEYS_URL,
  DEFAULT_MODEL,
  aiderConfPath,
  aiderConfYaml,
  ccrConfigJsonPath,
  ccrHasProvider,
  ccrSqlitePath,
  codexConfigPath,
  codexHasProvider,
  codexTomlBlock,
  continueConfigPath,
  continueFreshConfigYaml,
  continueModelYaml,
  resolveClientSlug,
  t2codeCredentialsPath,
  t2codeHasKey,
  withCcrProvider,
  withT2codeKey,
  type CcrConfig,
  type ConnectClientSlug,
  type T2codeCredentials,
} from './clients.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
  printWarning,
} from '../../output.js';

// ------------------------------------------------------------- key handling

function t2000ConfigPath(): string {
  return join(homedir(), '.t2000', 'config.json');
}

function loadSavedKey(): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(t2000ConfigPath(), 'utf-8')) as Record<string, unknown>;
    const inference = raw.inference;
    if (typeof inference === 'object' && inference !== null) {
      const key = (inference as Record<string, unknown>).apiKey;
      if (typeof key === 'string' && key.length > 0) return key;
    }
  } catch {
    // no config yet
  }
  return undefined;
}

/** Merge-write the key into ~/.t2000/config.json (preserves limits etc). */
function saveKey(key: string): void {
  const path = t2000ConfigPath();
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  const merged = { ...existing, inference: { apiKey: key } };
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
}

function resolveKey(flagKey?: string): { key?: string; source: string } {
  if (flagKey && flagKey.trim().length > 0) return { key: flagKey.trim(), source: '--key' };
  const envKey = process.env.T2000_API_KEY;
  if (envKey && envKey.trim().length > 0) return { key: envKey.trim(), source: 'T2000_API_KEY' };
  const saved = loadSavedKey();
  if (saved) return { key: saved, source: '~/.t2000/config.json' };
  return { source: 'none' };
}

// ---------------------------------------------------------------- fs helpers

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return {} as T;
  }
}

function writeFileEnsuringDir(path: string, contents: string, mode?: number): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, contents, mode !== undefined ? { mode } : undefined);
}

// -------------------------------------------------------------- per client

interface ConnectResult {
  client: ConnectClientSlug;
  action: 'written' | 'exists' | 'snippet' | 'instructions';
  path?: string;
  detail: string;
  /** Snippet/instruction text (also printed in human mode). */
  text?: string;
}

function connectT2code(key: string, print: boolean): ConnectResult {
  const path = t2codeCredentialsPath();
  const existing = readJson<T2codeCredentials>(path);
  if (t2codeHasKey(existing, key)) {
    return { client: 't2code', action: 'exists', path, detail: 'already connected with this key' };
  }
  if (print) {
    return {
      client: 't2code',
      action: 'snippet',
      path,
      detail: 'would write the key into t2 code credentials',
      text: `Would set default.authToken in ${path}`,
    };
  }
  writeFileEnsuringDir(path, JSON.stringify(withT2codeKey(existing, key), null, 2), 0o600);
  return {
    client: 't2code',
    action: 'written',
    path,
    detail: 'key saved — run `t2code` (or `npm i -g @t2000/code` first)',
  };
}

function connectClaudeCode(key: string, print: boolean): ConnectResult {
  const sqlite = ccrSqlitePath();
  if (existsSync(sqlite)) {
    // ccr migrated to SQLite-managed config; config.json is only read once
    // (on first launch, when no SQLite config exists). Don't write dead files.
    return {
      client: 'claude-code',
      action: 'instructions',
      detail: 'claude-code-router already manages config in SQLite — add the provider in its UI',
      text: [
        `claude-code-router found (SQLite config). Add the provider in the ccr UI:`,
        `  Providers → Add Provider → Other / custom API endpoint`,
        `    name:      t2000`,
        `    base URL:  ${API_BASE}/chat/completions`,
        `    protocol:  OpenAI`,
        `    API key:   ${key}`,
        `    models:    ${DEFAULT_MODEL}`,
        `  Then set the default route to t2000,${DEFAULT_MODEL}.`,
      ].join('\n'),
    };
  }
  const path = ccrConfigJsonPath();
  const existing = readJson<CcrConfig>(path);
  const already = ccrHasProvider(existing);
  if (print) {
    return {
      client: 'claude-code',
      action: 'snippet',
      path,
      detail: already ? 't2000 provider already present' : 'would add the t2000 provider',
      text: JSON.stringify(withCcrProvider(existing, key), null, 2),
    };
  }
  writeFileEnsuringDir(path, JSON.stringify(withCcrProvider(existing, key), null, 2) + '\n', 0o600);
  return {
    client: 'claude-code',
    action: 'written',
    path,
    detail: already
      ? 't2000 provider refreshed — install ccr (npm i -g @musistudio/claude-code-router), then `ccr code`'
      : 't2000 provider added — install ccr (npm i -g @musistudio/claude-code-router), then `ccr code`',
  };
}

function connectContinue(key: string, print: boolean): ConnectResult {
  const path = continueConfigPath();
  if (!existsSync(path) && !print) {
    writeFileEnsuringDir(path, continueFreshConfigYaml(key), 0o600);
    return { client: 'continue', action: 'written', path, detail: 'config.yaml created' };
  }
  // Existing YAML is user-owned — never parse-and-mangle; hand over the block.
  return {
    client: 'continue',
    action: 'snippet',
    path,
    detail: existsSync(path)
      ? 'config.yaml exists — paste this model block under `models:`'
      : 'would create config.yaml with this model block',
    text: continueModelYaml(key),
  };
}

function connectAider(key: string, print: boolean): ConnectResult {
  const path = aiderConfPath();
  if (!existsSync(path) && !print) {
    writeFileEnsuringDir(path, aiderConfYaml(key), 0o600);
    return { client: 'aider', action: 'written', path, detail: '.aider.conf.yml created' };
  }
  return {
    client: 'aider',
    action: 'snippet',
    path,
    detail: existsSync(path)
      ? '.aider.conf.yml exists — add these lines (or use the flags below)'
      : 'would create .aider.conf.yml',
    text:
      aiderConfYaml(key) +
      `\n# or without touching the file:\n` +
      `#   aider --openai-api-base ${API_BASE} --openai-api-key ${key} --model openai/${DEFAULT_MODEL}`,
  };
}

function connectCodex(key: string, print: boolean): ConnectResult {
  const path = codexConfigPath();
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  if (codexHasProvider(existing)) {
    return {
      client: 'codex',
      action: 'exists',
      path,
      detail: 't2000 provider already in config.toml — run `codex --profile t2000`',
    };
  }
  if (print) {
    return {
      client: 'codex',
      action: 'snippet',
      path,
      detail: 'would append the t2000 provider + profile',
      text: codexTomlBlock(),
    };
  }
  if (existsSync(path)) appendFileSync(path, codexTomlBlock());
  else writeFileEnsuringDir(path, codexTomlBlock().trimStart(), 0o600);
  return {
    client: 'codex',
    action: 'written',
    path,
    detail: `provider + profile added — export T2000_API_KEY=${maskKey(key)} then \`codex --profile t2000\``,
  };
}

function connectCline(key: string): ConnectResult {
  return {
    client: 'cline',
    action: 'instructions',
    detail: 'Cline stores provider config in VS Code — set it in the extension settings',
    text: [
      `In Cline settings, choose the "OpenAI Compatible" API provider:`,
      `  Base URL:  ${API_BASE}`,
      `  API key:   ${key}`,
      `  Model ID:  ${DEFAULT_MODEL}`,
    ].join('\n'),
  };
}

function connectCursor(key: string): ConnectResult {
  return {
    client: 'cursor',
    action: 'instructions',
    detail: 'Cursor is configured in Settings — no file to write',
    text: [
      `Cursor → Settings → Models → API Keys:`,
      `  1. Paste the key into "OpenAI API Key": ${maskKey(key)}`,
      `  2. Expand "Override OpenAI Base URL" and set: ${API_BASE}`,
      `  3. Under Models, add \`${DEFAULT_MODEL}\`, then Verify.`,
      `Note: Cursor's agent features are tuned for its own models — use this`,
      `for private chat models; delegation runs through t2 code.`,
    ].join('\n'),
  };
}

function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 5)}…${key.slice(-3)}` : 'sk-…';
}

// ------------------------------------------------------------------ command

function runConnect(slug: ConnectClientSlug, key: string, print: boolean): ConnectResult {
  switch (slug) {
    case 't2code':
      return connectT2code(key, print);
    case 'claude-code':
      return connectClaudeCode(key, print);
    case 'continue':
      return connectContinue(key, print);
    case 'aider':
      return connectAider(key, print);
    case 'codex':
      return connectCodex(key, print);
    case 'cline':
      return connectCline(key);
    case 'cursor':
      return connectCursor(key);
  }
}

export function registerConnect(program: Command): void {
  program
    .command('connect')
    .description('Point a coding tool at Private Inference (api.t2000.ai/v1) with your key')
    .argument('[client]', 'client to connect: t2code | claude-code | continue | aider | codex | cline | cursor')
    .option('--key <sk-key>', `Private Inference key (create one at ${CONSOLE_KEYS_URL})`)
    .option('--print', 'Show what would be written / the paste snippet, without writing')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 connect                         List supported clients
  $ t2 connect t2code --key sk-...     Save your key into t2 code
  $ t2 connect claude-code             Add the t2000 provider to claude-code-router
  $ t2 connect aider --print           Show the aider config without writing it

The key comes from the console: sign in at ${CONSOLE_KEYS_URL}
(Google), create an API key, paste it once — it is saved to ~/.t2000/config.json
and reused by later connects. All clients get model ${DEFAULT_MODEL} (the router;
you pay the price of the model that actually served each request).`,
    )
    .action(async (clientArg: string | undefined, opts: { key?: string; print?: boolean }) => {
      try {
        if (!clientArg) {
          const { key } = resolveKey(opts.key);
          if (isJsonMode()) {
            printJson({
              clients: CONNECT_CLIENTS.map((c) => ({ slug: c.slug, name: c.name, blurb: c.blurb })),
              keySaved: !!key,
            });
            return;
          }
          printBlank();
          printLine('  Connect a coding tool to Private Inference:');
          printBlank();
          for (const c of CONNECT_CLIENTS) {
            printKeyValue(c.slug.padEnd(12), c.blurb);
          }
          printBlank();
          printInfo(`Usage: t2 connect <client> [--key sk-...]`);
          printInfo(
            key ? 'A key is saved — connects will reuse it.' : `No key yet — create one at ${CONSOLE_KEYS_URL}`,
          );
          printBlank();
          return;
        }

        const slug = resolveClientSlug(clientArg);
        if (!slug) {
          printWarning(`Unknown client '${clientArg}'.`);
          printInfo(`Supported: ${CONNECT_CLIENTS.map((c) => c.slug).join(' · ')}`);
          process.exitCode = 1;
          return;
        }

        const { key, source } = resolveKey(opts.key);
        if (!key) {
          printBlank();
          printWarning('No API key found.');
          printInfo(`1. Sign in at ${CONSOLE_KEYS_URL} (Google) and create an API key`);
          printInfo(`2. Re-run: t2 connect ${slug} --key sk-...`);
          printBlank();
          process.exitCode = 1;
          return;
        }

        const result = runConnect(slug, key, !!opts.print);

        // Persist the key for future connects (not in --print dry runs).
        if (!opts.print && source !== '~/.t2000/config.json') saveKey(key);

        if (isJsonMode()) {
          printJson({ ...result, keySource: source });
          return;
        }

        printBlank();
        if (result.action === 'written') {
          printSuccess(`${slug}: ${result.detail}`);
          if (result.path) printKeyValue('wrote', result.path);
        } else if (result.action === 'exists') {
          printInfo(`${slug}: ${result.detail}`);
        } else {
          printInfo(`${slug}: ${result.detail}`);
        }
        if (result.text) {
          printBlank();
          for (const line of result.text.split('\n')) printLine(`  ${line}`);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
