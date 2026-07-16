// [SPEC_INFERENCE_DEMAND Step 1 item 1 — un-HELD 2026-07-16]
// `t2 connect <client>` data layer: per-client config paths + pure config
// builders/mergers. Kept separate from the commander file (the `t2 mcp`
// platforms.ts pattern) so unit tests exercise the merge logic without disk.
//
// Write policy (the safety contract):
//   - A config file we fully own the schema of (t2code credentials, fresh
//     files) → write/merge it.
//   - A config file the USER owns that already exists (Continue YAML, aider
//     conf) → never parse-and-mangle; print the paste-ready snippet instead.
//   - GUI-managed config (Cline, Cursor, ccr's SQLite) → instructions only.

import { join } from 'node:path';
import { homedir } from 'node:os';

export const API_BASE = 'https://api.t2000.ai/v1';
export const CHAT_COMPLETIONS_URL = `${API_BASE}/chat/completions`;
export const DEFAULT_MODEL = 't2000/auto';
export const OPEN_MODEL = 't2000/auto-open';
export const CONSOLE_KEYS_URL = 'https://agents.t2000.ai/manage';

export type ConnectClientSlug =
  | 't2code'
  | 'claude-code'
  | 'continue'
  | 'aider'
  | 'codex'
  | 'grok'
  | 'cline'
  | 'cursor';

export interface ConnectClient {
  slug: ConnectClientSlug;
  name: string;
  aliases: string[];
  /** One-line description shown in the `t2 connect` list. */
  blurb: string;
}

export const CONNECT_CLIENTS: ConnectClient[] = [
  {
    slug: 't2code',
    name: 't2 code',
    aliases: ['code'],
    blurb: 'the t2000 coding agent (npm i -g @t2000/code) — saves your key',
  },
  {
    slug: 'claude-code',
    name: 'Claude Code (via claude-code-router)',
    aliases: ['ccr', 'claude'],
    blurb: 'adds a t2000 provider to ~/.claude-code-router',
  },
  {
    slug: 'continue',
    name: 'Continue',
    aliases: [],
    blurb: 'model entry for ~/.continue/config.yaml',
  },
  {
    slug: 'aider',
    name: 'Aider',
    aliases: [],
    blurb: 'OpenAI-compatible base + model for ~/.aider.conf.yml',
  },
  {
    slug: 'codex',
    name: 'OpenAI Codex CLI',
    aliases: [],
    blurb: 't2000 provider profile in ~/.codex/config.toml',
  },
  {
    slug: 'grok',
    name: 'Grok Build',
    aliases: ['grok-build'],
    blurb: 'custom-model block in ~/.grok/config.toml (the BYOK pattern)',
  },
  {
    slug: 'cline',
    name: 'Cline',
    aliases: [],
    blurb: 'settings walkthrough (GUI-managed config)',
  },
  {
    slug: 'cursor',
    name: 'Cursor',
    aliases: [],
    blurb: 'settings walkthrough (GUI-managed config)',
  },
];

export function resolveClientSlug(input: string): ConnectClientSlug | undefined {
  const needle = input.toLowerCase();
  for (const c of CONNECT_CLIENTS) {
    if (c.slug === needle || c.aliases.includes(needle)) return c.slug;
  }
  return undefined;
}

// ---------------------------------------------------------------- t2 code

export function t2codeCredentialsPath(home = homedir()): string {
  return join(home, '.config', 't2code', 'credentials.json');
}

export interface T2codeCredentials {
  default?: { name?: string; email?: string; authToken?: string };
  [key: string]: unknown;
}

/** Merge the key into t2code's credentials file shape (preserves email etc). */
export function withT2codeKey(existing: T2codeCredentials, key: string): T2codeCredentials {
  return {
    ...existing,
    default: {
      name: 't2000',
      email: '',
      ...(typeof existing.default === 'object' && existing.default !== null
        ? existing.default
        : {}),
      authToken: key,
    },
  };
}

export function t2codeHasKey(existing: T2codeCredentials, key: string): boolean {
  return existing.default?.authToken === key;
}

// ------------------------------------------------- claude-code-router (ccr)

export function ccrDir(home = homedir()): string {
  return join(home, '.claude-code-router');
}

export function ccrSqlitePath(home = homedir()): string {
  return join(ccrDir(home), 'config.sqlite');
}

export function ccrConfigJsonPath(home = homedir()): string {
  return join(ccrDir(home), 'config.json');
}

interface CcrProvider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  [key: string]: unknown;
}

export interface CcrConfig {
  Providers?: CcrProvider[];
  Router?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Merge the t2000 provider into a ccr config.json. Replace-or-append the
 * `t2000` provider; set `Router.default` only when absent so an existing
 * routing setup is never stomped.
 */
export function withCcrProvider(existing: CcrConfig, key: string): CcrConfig {
  const provider: CcrProvider = {
    name: 't2000',
    api_base_url: CHAT_COMPLETIONS_URL,
    api_key: key,
    models: [DEFAULT_MODEL, OPEN_MODEL],
  };
  const providers = Array.isArray(existing.Providers) ? [...existing.Providers] : [];
  const idx = providers.findIndex((p) => p?.name === 't2000');
  if (idx >= 0) providers[idx] = { ...providers[idx], ...provider };
  else providers.push(provider);

  const router = { ...(existing.Router ?? {}) };
  if (!router.default) router.default = `t2000,${DEFAULT_MODEL}`;

  return { ...existing, Providers: providers, Router: router };
}

export function ccrHasProvider(existing: CcrConfig): boolean {
  return Array.isArray(existing.Providers) && existing.Providers.some((p) => p?.name === 't2000');
}

// ----------------------------------------------------------------- Continue

export function continueConfigPath(home = homedir()): string {
  return join(home, '.continue', 'config.yaml');
}

/** The model block — used both as a fresh file body and as a paste snippet. */
export function continueModelYaml(key: string): string {
  return [
    `  - name: t2000 auto`,
    `    provider: openai`,
    `    model: ${DEFAULT_MODEL}`,
    `    apiBase: ${API_BASE}`,
    `    apiKey: ${key}`,
    `    roles:`,
    `      - chat`,
    `      - edit`,
    `      - apply`,
  ].join('\n');
}

export function continueFreshConfigYaml(key: string): string {
  return [
    `name: t2000 Private Inference`,
    `version: 0.0.1`,
    `schema: v1`,
    ``,
    `models:`,
    continueModelYaml(key),
    ``,
  ].join('\n');
}

// -------------------------------------------------------------------- Aider

export function aiderConfPath(home = homedir()): string {
  return join(home, '.aider.conf.yml');
}

export function aiderConfYaml(key: string): string {
  return [
    `# t2000 Private Inference (written by \`t2 connect aider\`)`,
    `openai-api-base: ${API_BASE}`,
    `openai-api-key: ${key}`,
    `model: openai/${DEFAULT_MODEL}`,
    ``,
  ].join('\n');
}

// -------------------------------------------------------------------- Codex

export function codexConfigPath(home = homedir()): string {
  return join(home, '.codex', 'config.toml');
}

/** Appended to config.toml — key rides the T2000_API_KEY env, never the file. */
export function codexTomlBlock(): string {
  return [
    ``,
    `# t2000 Private Inference (written by \`t2 connect codex\`)`,
    `[model_providers.t2000]`,
    `name = "t2000"`,
    `base_url = "${API_BASE}"`,
    `env_key = "T2000_API_KEY"`,
    ``,
    `[profiles.t2000]`,
    `model = "${DEFAULT_MODEL}"`,
    `model_provider = "t2000"`,
    ``,
  ].join('\n');
}

export function codexHasProvider(existingToml: string): boolean {
  return existingToml.includes('[model_providers.t2000]');
}

// --------------------------------------------------------------- Grok Build
//
// Grok Build (xAI's TUI) supports BYOK custom models via ~/.grok/config.toml
// `[model.<alias>]` blocks — the generic custom-model TOML pattern; any tool
// with the same shape reuses these builders. Key rides T2000_API_KEY (env_key),
// never the file.

export function grokConfigPath(home = homedir()): string {
  return join(home, '.grok', 'config.toml');
}

/** Appended to config.toml — safe because `[model.t2000]` is a unique table. */
export function grokModelBlock(): string {
  return [
    ``,
    `# t2000 Private Inference (written by \`t2 connect grok\`)`,
    `[model.t2000]`,
    `model = "${DEFAULT_MODEL}"`,
    `base_url = "${API_BASE}"`,
    `name = "t2000 auto (Private Inference)"`,
    `env_key = "T2000_API_KEY"`,
    `api_backend = "chat_completions"`,
    ``,
  ].join('\n');
}

/**
 * Fresh-file body only: `[models]` may already exist in a user config and
 * duplicating the table would be invalid TOML, so the default is only set
 * when we own the whole file.
 */
export function grokFreshConfigToml(): string {
  return grokModelBlock().trimStart() + [`[models]`, `default = "t2000"`, ``].join('\n');
}

export function grokHasModel(existingToml: string): boolean {
  return existingToml.includes('[model.t2000]');
}
