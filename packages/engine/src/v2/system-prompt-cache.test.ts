// ---------------------------------------------------------------------------
// v2/system-prompt-cache.test.ts — F-12 regression tests
// ---------------------------------------------------------------------------
//
// Verifiable goal: prove that the v2 engine NO LONGER strips
// `cache_control` markers when reducing `SystemBlock[]` for the AI SDK.
//
// Phase 0 smoke (2026-05-18) confirmed cacheR=0 / cacheW=0 across 5
// production turns; this test suite proves the fix at the unit boundary so
// the bug becomes structurally impossible to reintroduce without breaking
// the assertion below.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  systemBlockToModelMessage,
  buildSystemForStream,
  buildPrepareStepSystem,
} from './system-prompt-cache.js';
import type { SystemBlock } from '../types.js';

describe('systemBlockToModelMessage', () => {
  it('preserves text + role for a plain block (no cache_control)', () => {
    const block: SystemBlock = { type: 'text', text: 'Static identity' };
    const msg = systemBlockToModelMessage(block);
    expect(msg).toEqual({ role: 'system', content: 'Static identity' });
    expect(msg.providerOptions).toBeUndefined();
  });

  it('threads cache_control through providerOptions.anthropic.cacheControl', () => {
    const block: SystemBlock = {
      type: 'text',
      text: 'Cached static prefix',
      cache_control: { type: 'ephemeral' },
    };
    const msg = systemBlockToModelMessage(block);
    expect(msg).toEqual({
      role: 'system',
      content: 'Cached static prefix',
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    });
  });
});

describe('buildSystemForStream', () => {
  it('returns undefined when input is undefined', () => {
    expect(buildSystemForStream(undefined)).toBeUndefined();
  });

  it('returns plain string unchanged (back-compat for legacy hosts)', () => {
    expect(buildSystemForStream('You are an assistant.')).toBe('You are an assistant.');
  });

  it('converts SystemBlock[] to SystemModelMessage[] preserving cache markers', () => {
    const sp: SystemBlock[] = [
      { type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'dynamic' },
    ];
    const result = buildSystemForStream(sp);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([
      {
        role: 'system',
        content: 'STATIC',
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      { role: 'system', content: 'dynamic' },
    ]);
  });

  it('REGRESSION GUARD — does not flatten cache-marked blocks to a string', () => {
    // The exact bug pattern from v2/engine.ts:1370-1373 (pre-F-12):
    //   `sp.map((b) => b.text).join('\n\n')`
    // produced 'STATIC\n\ndynamic' and lost the cache marker.
    // Post-F-12, the result MUST be an array of typed messages, NOT a string.
    const sp: SystemBlock[] = [
      { type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'dynamic' },
    ];
    const result = buildSystemForStream(sp);
    expect(typeof result).not.toBe('string');
    expect(result).not.toBe('STATIC\n\ndynamic');
  });
});

describe('buildPrepareStepSystem', () => {
  it('drops empty volatile layers', () => {
    const baseSystem = 'Base prompt';
    const result = buildPrepareStepSystem(baseSystem, ['', 'memory block', '']);
    expect(result).toBe('Base prompt\n\nmemory block');
  });

  it('joins layers as a string when base is a plain string (legacy)', () => {
    const result = buildPrepareStepSystem('Base', ['fin', 'mem', 'skill']);
    expect(result).toBe('Base\n\nfin\n\nmem\n\nskill');
  });

  it('preserves base cache markers when base is typed SystemBlock[]', () => {
    const baseSystem = buildSystemForStream([
      { type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'base dynamic' },
    ]);
    const result = buildPrepareStepSystem(baseSystem, ['financial', 'memory', 'skill']);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([
      {
        role: 'system',
        content: 'STATIC',
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      { role: 'system', content: 'base dynamic' },
      { role: 'system', content: 'financial' },
      { role: 'system', content: 'memory' },
      { role: 'system', content: 'skill' },
    ]);
  });

  it('volatile layers are appended WITHOUT cache_control (they change per turn)', () => {
    const baseSystem = buildSystemForStream([
      { type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral' } },
    ]);
    const result = buildPrepareStepSystem(baseSystem, ['financial', 'memory']);
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) return; // type narrow

    // Base block keeps cache marker
    expect(result[0]?.providerOptions?.anthropic).toEqual({
      cacheControl: { type: 'ephemeral' },
    });

    // Volatile layers do NOT get cache markers — they change per turn and
    // would invalidate the cache prefix if marked.
    expect(result[1]?.providerOptions).toBeUndefined();
    expect(result[2]?.providerOptions).toBeUndefined();
  });

  it('drops empty volatile layers from typed-array output too', () => {
    const baseSystem = buildSystemForStream([
      { type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral' } },
    ]);
    const result = buildPrepareStepSystem(baseSystem, ['', 'memory', '']);
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) return;
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ role: 'system', content: 'memory' });
  });

  it('handles undefined base + all-empty volatile layers (degenerate)', () => {
    const result = buildPrepareStepSystem(undefined, ['', '', '']);
    expect(result).toBe('');
  });

  it('handles undefined base + non-empty volatile layers (memory-only)', () => {
    const result = buildPrepareStepSystem(undefined, ['', 'memory recall', '']);
    expect(result).toBe('memory recall');
  });
});
