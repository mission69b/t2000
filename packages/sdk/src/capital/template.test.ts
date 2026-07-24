import { describe, expect, it } from 'vitest';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { deserialize } from '@mysten/move-bytecode-template';
import {
  AGENT_TOKEN_LP_ALLOCATION,
  AGENT_TOKEN_TOTAL_SUPPLY,
  AGENT_TOKEN_TREASURY_ALLOCATION,
  buildAgentCoinModule,
  validateAgentCoinParams,
  type AgentCoinParams,
} from './template.js';
import { T2000Error } from '../errors.js';

const LAUNCHER = normalizeSuiAddress('0xf00d');

const good = (): AgentCoinParams => ({
  symbol: 'FUNKII',
  name: 'Funkii Studio',
  description: 'Agent token for Funkii Studio (funkii@audric, agent #16)',
  iconUrl: 'https://audric.ai/funkii.png',
  recipient: LAUNCHER,
});

describe('economics constants', () => {
  it('locks 1B at 6dp, split exactly 50/50 with no remainder lost', () => {
    expect(AGENT_TOKEN_TOTAL_SUPPLY).toBe(1_000_000_000_000_000n);
    expect(AGENT_TOKEN_LP_ALLOCATION + AGENT_TOKEN_TREASURY_ALLOCATION).toBe(
      AGENT_TOKEN_TOTAL_SUPPLY,
    );
    expect(AGENT_TOKEN_LP_ALLOCATION).toBe(AGENT_TOKEN_TREASURY_ALLOCATION);
  });
});

describe('validateAgentCoinParams', () => {
  it('accepts a clean launch', () => {
    expect(() => validateAgentCoinParams(good())).not.toThrow();
  });

  it.each(['SUI', 'USDC', 'CETUS', 'usdc', 'Wal'])(
    'blocks impersonation ticker %s case-insensitively',
    (symbol) => {
      expect(() => validateAgentCoinParams({ ...good(), symbol })).toThrow(
        T2000Error,
      );
    },
  );

  it.each(['A', 'TOOLONGGG', '1ABC', 'AB-C', 'ab c'])(
    'rejects malformed symbol %s',
    (symbol) => {
      expect(() => validateAgentCoinParams({ ...good(), symbol })).toThrow(
        T2000Error,
      );
    },
  );

  it('rejects http (non-https) icon urls', () => {
    expect(() =>
      validateAgentCoinParams({ ...good(), iconUrl: 'http://x.com/i.png' }),
    ).toThrow(T2000Error);
  });

  it('rejects a bad recipient address', () => {
    expect(() =>
      validateAgentCoinParams({ ...good(), recipient: '0xnope' }),
    ).toThrow(T2000Error);
  });
});

describe('buildAgentCoinModule', () => {
  it('rewrites identifiers + constants into valid bytecode', async () => {
    const mod = await buildAgentCoinModule(good());
    expect(mod.moduleName).toBe('funkii');
    expect(mod.otw).toBe('FUNKII');
    expect(mod.dependencies).toEqual([
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    ]);
    // The rewritten module must still deserialize (round-trip validity) and
    // must not contain the template placeholders anywhere.
    const bytes = Uint8Array.from(mod.modules[0]);
    expect(() => deserialize(bytes)).not.toThrow();
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).not.toContain('TMPL');
    expect(text).not.toContain('Template Coin');
    expect(text).toContain('FUNKII');
    expect(text).toContain('Funkii Studio');
  });

  it('is deterministic — same params, same bytes', async () => {
    const a = await buildAgentCoinModule(good());
    const b = await buildAgentCoinModule(good());
    expect(Buffer.from(a.modules[0]).equals(Buffer.from(b.modules[0]))).toBe(true);
  });

  it('lowercases the module and uppercases the OTW (Move OTW rule)', async () => {
    const mod = await buildAgentCoinModule({ ...good(), symbol: 'FnKi2' });
    expect(mod.moduleName).toBe('fnki2');
    expect(mod.otw).toBe('FNKI2');
  });
});
