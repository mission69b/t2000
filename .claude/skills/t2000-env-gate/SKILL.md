---
name: t2000-env-gate
description: >-
  The cross-app env-validation contract — every app with ≥1 required env var
  validates at boot via a Zod schema and exposes values through a typed `env`
  proxy; raw `process.env.X` reads are banned outside the env module. Use when
  adding or renaming an environment variable, wiring up a new app in apps/*,
  writing or reviewing a lib/env.ts, debugging a "works locally, broken in
  Vercel" misconfiguration, or when you catch yourself about to write
  process.env or a `process.env.X || 'default'` fallback.
---

# Env Validation Gate (cross-app standard)

`CLAUDE.md` rule 7 states the invariant and the zero-required-vars carve-out.
This is the pattern behind it.

## Why this rule exists

April 2026: an audric production deploy ran ~4 days with `BLOCKVISION_API_KEY=""`
(empty string in the Vercel UI), silently degrading every BlockVision-backed
feature. It surfaced as "the LLM thinks the user has no DeFi positions" — three
layers below the actual misconfig. An empty string is truthy-adjacent enough to
pass every `if (!key)` guard and every `||` fallback, so nothing failed loudly.

## The contract

1. Define a `lib/env.ts` (Next apps) or `src/env.ts` (servers) Zod schema.
2. Required vars use `z.string().trim().min(1, …)` — **empty string is invalid**.
3. Optional vars normalize empty/whitespace → `undefined`.
4. Schema runs at first import; trigger that import from a boot-time hook:
   - Next.js → `instrumentation.ts` `register()`
   - Node server → top of `server.ts` / `index.ts`
5. Export a typed `env` proxy that throws on server-only access from the client.
6. Enforce: ESLint `no-restricted-syntax` on raw `process.env.X` outside the env
   module (gateway), or Biome + code review (audric web-v3).

## Canonical reference implementation

`audric/apps/web-v3/lib/env.ts` + `audric/apps/web-v3/instrumentation.ts`.

```typescript
import { z } from 'zod';

const requiredString = z.string().trim().min(1, 'must be a non-empty string');
const optionalString = z.string().optional().transform((v) =>
  v === undefined ? undefined : v.trim().length > 0 ? v.trim() : undefined,
);

const serverSchema = z.object({
  ANTHROPIC_API_KEY: requiredString,
  // …
});

const clientSchema = z.object({
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: requiredString,
  // …
});

// Literal references — Next.js static replacement requires this shape:
const runtimeEnv = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  // …
};

const isServer =
  typeof process !== 'undefined' &&
  (typeof process.versions?.node === 'string' ||
    process.env?.NEXT_RUNTIME === 'edge');

const fullSchema = z.object({ ...serverSchema.shape, ...clientSchema.shape });
const parsed = (isServer ? fullSchema : clientSchema).safeParse(runtimeEnv);

if (!parsed.success) {
  // Format ALL issues + the settings URL — operators fix in one click.
  throw new Error(/* formatted block */);
}

export const env = new Proxy(parsed.data, {
  get(target, prop) {
    if (!isServer && SERVER_ONLY_KEYS.has(prop as string)) {
      throw new Error(`[env] Cannot access server-only var '${String(prop)}' from the client`);
    }
    return target[prop as keyof typeof target];
  },
});
```

## What's banned

```typescript
const k = process.env.X;              // ❌ bypasses the gate
const k = process.env.X || 'default'; // ❌ fallback masks misconfig forever

import { env } from '@/lib/env';
const k = env.X;                      // ✅ through the gate
const k = env.X ?? 'default';         // ✅ explicit optional default
```

## Exemptions

- `process.env.NODE_ENV` — build-time constant.
- `process.env.NEXT_RUNTIME` — runtime detection inside `lib/env.ts` itself.
- The env module (it *is* the gate).
- **Apps with ZERO required env vars** may validate inline at the read site
  instead of installing a full Zod gate (CLAUDE.md rule 7 carve-out, S.227) —
  e.g. `t2000/apps/web`, a static marketing site with only optional Sui-address
  overrides. The bug class this prevents (a REQUIRED var silently degrading)
  doesn't exist when nothing is required. **Ship the gate the moment such an app
  adds its first required var.**

## Adding a var

Schema first, then read via `env.X`. Never the other way round.

## Related

- The incident → S.20 / S.25 in `audric-build-tracker.md`
- audric-side rule → `audric/.cursor/rules/env-validation-gate.mdc`
