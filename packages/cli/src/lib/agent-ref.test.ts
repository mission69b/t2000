import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentRefFields,
  expandAgentRefs,
  isAgentRefField,
  looksLikeAgentRefKey,
  looksLikeAgentRefValue,
  resolveAgentRef,
} from './agent-ref.js';

// The gate decides which buyer-typed values get swapped for a wallet address
// in a spec that is about to be hashed and escrowed. Wrong in either
// direction is silent and expensive: too loose and `{sla_hours:"24"}` freezes
// as agent #24's address; too tight and the buyer is back on an explorer.
//
// These cases mirror audric `apps/console/lib/agent-ref.test.ts` one for one —
// the gate is duplicated across repos (no `@audric/*` in the CLI), so the
// tests are how the two stay in step.

const FULL_ADDR = `0x${'a'.repeat(64)}`;

describe('isAgentRefField (the resolve gate)', () => {
  it('resolves hash-prefixed ids on any key', () => {
    expect(isAgentRefField('notes', '#93')).toBe(true);
    expect(isAgentRefField('anything_at_all', '#7')).toBe(true);
  });

  it('resolves bare digits ONLY on an agent-ish key', () => {
    expect(isAgentRefField('agent_address', '93')).toBe(true);
    expect(isAgentRefField('subject', '93')).toBe(true);
    expect(isAgentRefField('pay_to', '93')).toBe(true);
    // The regression this gate exists for.
    expect(isAgentRefField('sla_hours', '24')).toBe(false);
    expect(isAgentRefField('retries', '5')).toBe(false);
    expect(isAgentRefField('score', '100')).toBe(false);
  });

  it('resolves full addresses anywhere, and lets the SERVER judge short hex', () => {
    expect(isAgentRefField('notes', FULL_ADDR)).toBe(true);
    // Reaches the resolver, which rejects it rather than zero-padding it
    // into a wallet nobody owns.
    expect(isAgentRefField('notes', '0x93')).toBe(true);
  });

  it('resolves @handles but never bare usernames', () => {
    expect(isAgentRefField('notes', '@funkii')).toBe(true);
    expect(isAgentRefField('agent_address', 'funkii')).toBe(false);
  });

  it('never touches free text, whatever the key is called', () => {
    expect(isAgentRefField('address', '123 Main Street')).toBe(false);
    expect(isAgentRefField('agent_address', 'the one from yesterday')).toBe(false);
    expect(isAgentRefField('brief', 'Assess #93 and report back')).toBe(false);
    expect(isAgentRefField('agent_address', '')).toBe(false);
  });

  it('keeps the value and key predicates independent', () => {
    // Bare digits are not self-describing — that's the whole point.
    expect(looksLikeAgentRefValue('93')).toBe(false);
    expect(looksLikeAgentRefValue('#93')).toBe(true);
    expect(looksLikeAgentRefKey('sla_hours')).toBe(false);
    expect(looksLikeAgentRefKey('agent_address')).toBe(true);
  });
});

describe('agentRefFields', () => {
  it('picks only the resolvable entries', () => {
    expect(
      agentRefFields({
        agent_address: '93',
        sla_hours: '24',
        notes: '#7',
        brief: 'do the thing',
      }),
    ).toEqual([
      ['agent_address', '93'],
      ['notes', '#7'],
    ]);
  });

  it('ignores non-object requirements', () => {
    expect(agentRefFields('a free-text brief')).toEqual([]);
    expect(agentRefFields(null)).toEqual([]);
    expect(agentRefFields(['93'])).toEqual([]);
  });
});

describe('resolveAgentRef (network)', () => {
  const BASE = 'https://api.example.test/v1';
  afterEach(() => vi.unstubAllGlobals());

  it('calls /agents/resolve and returns the address', async () => {
    const fn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ address: FULL_ADDR, numericId: 93, name: 'Aegis' }),
    }));
    vi.stubGlobal('fetch', fn);

    await expect(resolveAgentRef(BASE, '#93')).resolves.toEqual({
      address: FULL_ADDR,
      numericId: 93,
      name: 'Aegis',
    });
    expect(fn).toHaveBeenCalledWith(`${BASE}/agents/resolve?q=%2393`, expect.anything());
  });

  it("throws the SERVER's sentence so CLI and site explain a miss identically", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: 'No agent for #999999.' }),
      })),
    );
    await expect(resolveAgentRef(BASE, '999999')).rejects.toThrow(
      'No agent for #999999.',
    );
  });

  it('does not pad short hex client-side — the server refuses it', async () => {
    const fn = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'Use an Agent ID (#93), a handle, or a 0x… address.',
      }),
    }));
    vi.stubGlobal('fetch', fn);
    await expect(resolveAgentRef(BASE, '0x93')).rejects.toThrow(/Agent ID/);
    expect(fn).toHaveBeenCalledWith(`${BASE}/agents/resolve?q=0x93`, expect.anything());
  });
});

describe('expandAgentRefs', () => {
  const BASE = 'https://api.example.test/v1';
  afterEach(() => vi.unstubAllGlobals());

  it('writes back addresses and leaves everything else alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ address: FULL_ADDR }),
      })),
    );
    await expect(
      expandAgentRefs(BASE, {
        agent_address: '93',
        sla_hours: '24',
        brief: 'assess it',
      }),
    ).resolves.toEqual({
      agent_address: FULL_ADDR,
      sla_hours: '24',
      brief: 'assess it',
    });
  });

  it('passes free-text requirements straight through, with no network call', async () => {
    const fn = vi.fn();
    vi.stubGlobal('fetch', fn);
    await expect(expandAgentRefs(BASE, 'just a brief')).resolves.toBe(
      'just a brief',
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('names the offending key when a ref misses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: 'No agent for #999999.' }),
      })),
    );
    await expect(
      expandAgentRefs(BASE, { agent_address: '999999' }),
    ).rejects.toThrow('agent_address: No agent for #999999.');
  });
});
