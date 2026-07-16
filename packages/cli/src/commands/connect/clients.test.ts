// [SPEC_INFERENCE_DEMAND Step 1 item 1 — 2026-07-16]
// Pure-merge tests for the `t2 connect` data layer (no disk).

import { describe, it, expect } from 'vitest';
import {
  API_BASE,
  CHAT_COMPLETIONS_URL,
  DEFAULT_MODEL,
  OPEN_MODEL,
  aiderConfYaml,
  ccrHasProvider,
  codexHasProvider,
  codexTomlBlock,
  continueFreshConfigYaml,
  continueModelYaml,
  grokFreshConfigToml,
  grokHasModel,
  grokModelBlock,
  resolveClientSlug,
  t2codeHasKey,
  withCcrProvider,
  withT2codeKey,
} from './clients.js';

const KEY = 'sk-test-key-123';

describe('resolveClientSlug', () => {
  it('resolves slugs and aliases case-insensitively', () => {
    expect(resolveClientSlug('t2code')).toBe('t2code');
    expect(resolveClientSlug('code')).toBe('t2code');
    expect(resolveClientSlug('CCR')).toBe('claude-code');
    expect(resolveClientSlug('claude')).toBe('claude-code');
    expect(resolveClientSlug('aider')).toBe('aider');
    expect(resolveClientSlug('grok')).toBe('grok');
    expect(resolveClientSlug('grok-build')).toBe('grok');
  });

  it('returns undefined for unknown clients', () => {
    expect(resolveClientSlug('emacs')).toBeUndefined();
  });
});

describe('withT2codeKey', () => {
  it('writes the key into default.authToken on an empty file', () => {
    const next = withT2codeKey({}, KEY);
    expect(next.default?.authToken).toBe(KEY);
    expect(next.default?.name).toBe('t2000');
  });

  it('preserves existing fields and replaces only the token', () => {
    const next = withT2codeKey(
      { default: { name: 'me', email: 'a@b.c', authToken: 'sk-old' }, other: 1 },
      KEY,
    );
    expect(next.default?.authToken).toBe(KEY);
    expect(next.default?.email).toBe('a@b.c');
    expect(next.other).toBe(1);
  });

  it('t2codeHasKey detects an identical key (idempotency check)', () => {
    expect(t2codeHasKey({ default: { authToken: KEY } }, KEY)).toBe(true);
    expect(t2codeHasKey({ default: { authToken: 'sk-old' } }, KEY)).toBe(false);
    expect(t2codeHasKey({}, KEY)).toBe(false);
  });
});

describe('withCcrProvider', () => {
  it('appends the t2000 provider with the full chat-completions URL', () => {
    const next = withCcrProvider({}, KEY);
    expect(next.Providers).toHaveLength(1);
    const p = next.Providers![0];
    expect(p.name).toBe('t2000');
    expect(p.api_base_url).toBe(CHAT_COMPLETIONS_URL);
    expect(p.api_base_url.endsWith('/chat/completions')).toBe(true);
    expect(p.models).toEqual([DEFAULT_MODEL, OPEN_MODEL]);
  });

  it('replaces an existing t2000 provider instead of duplicating', () => {
    const first = withCcrProvider({}, 'sk-old');
    const next = withCcrProvider(first, KEY);
    expect(next.Providers).toHaveLength(1);
    expect(next.Providers![0].api_key).toBe(KEY);
  });

  it('keeps other providers and never stomps an existing Router.default', () => {
    const existing = {
      Providers: [{ name: 'deepseek', api_base_url: 'x', api_key: 'y', models: ['z'] }],
      Router: { default: 'deepseek,z' },
    };
    const next = withCcrProvider(existing, KEY);
    expect(next.Providers).toHaveLength(2);
    expect(next.Router!.default).toBe('deepseek,z');
  });

  it('sets Router.default when absent', () => {
    const next = withCcrProvider({}, KEY);
    expect(next.Router!.default).toBe(`t2000,${DEFAULT_MODEL}`);
  });

  it('ccrHasProvider detects presence', () => {
    expect(ccrHasProvider(withCcrProvider({}, KEY))).toBe(true);
    expect(ccrHasProvider({})).toBe(false);
  });
});

describe('continue yaml', () => {
  it('model block carries provider openai + apiBase + the router model', () => {
    const block = continueModelYaml(KEY);
    expect(block).toContain('provider: openai');
    expect(block).toContain(`apiBase: ${API_BASE}`);
    expect(block).toContain(`model: ${DEFAULT_MODEL}`);
    expect(block).toContain(KEY);
  });

  it('fresh config is a valid-looking yaml doc with schema v1', () => {
    const doc = continueFreshConfigYaml(KEY);
    expect(doc).toContain('schema: v1');
    expect(doc).toContain('models:');
  });
});

describe('aider conf', () => {
  it('points openai-api-base at /v1 and prefixes the model with openai/', () => {
    const conf = aiderConfYaml(KEY);
    expect(conf).toContain(`openai-api-base: ${API_BASE}`);
    expect(conf).toContain(`model: openai/${DEFAULT_MODEL}`);
    expect(conf).toContain(KEY);
  });
});

describe('codex toml', () => {
  it('uses env_key (the key never lands in the toml file)', () => {
    const block = codexTomlBlock();
    expect(block).toContain('env_key = "T2000_API_KEY"');
    expect(block).not.toContain('sk-');
    expect(block).toContain(`base_url = "${API_BASE}"`);
  });

  it('codexHasProvider detects the provider table', () => {
    expect(codexHasProvider(codexTomlBlock())).toBe(true);
    expect(codexHasProvider('')).toBe(false);
  });
});

describe('grok toml', () => {
  it('model block uses env_key (the key never lands in the toml file)', () => {
    const block = grokModelBlock();
    expect(block).toContain('[model.t2000]');
    expect(block).toContain(`model = "${DEFAULT_MODEL}"`);
    expect(block).toContain(`base_url = "${API_BASE}"`);
    expect(block).toContain('env_key = "T2000_API_KEY"');
    expect(block).toContain('api_backend = "chat_completions"');
    expect(block).not.toContain('sk-');
  });

  it('fresh config sets t2000 as the default model; append block does not', () => {
    const fresh = grokFreshConfigToml();
    expect(fresh).toContain('[models]');
    expect(fresh).toContain('default = "t2000"');
    // The append-to-existing block must never duplicate the [models] table.
    expect(grokModelBlock()).not.toContain('[models]');
  });

  it('grokHasModel detects the model table', () => {
    expect(grokHasModel(grokModelBlock())).toBe(true);
    expect(grokHasModel(grokFreshConfigToml())).toBe(true);
    expect(grokHasModel('')).toBe(false);
    expect(grokHasModel('[model.other]\nmodel = "x"')).toBe(false);
  });
});
