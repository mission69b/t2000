import { describe, it, expect, vi, beforeEach } from 'vitest';
import { explorerUrl, setJsonMode, isJsonMode } from './output.js';

describe('explorerUrl', () => {
  it('builds mainnet URL by default', () => {
    const url = explorerUrl('0xabc123');
    expect(url).toBe('https://suiscan.xyz/mainnet/tx/0xabc123');
  });

  it('builds testnet URL when specified', () => {
    const url = explorerUrl('0xabc123', 'testnet');
    expect(url).toBe('https://suiscan.xyz/testnet/tx/0xabc123');
  });

  it('builds mainnet URL when explicitly specified', () => {
    const url = explorerUrl('0xdef456', 'mainnet');
    expect(url).toBe('https://suiscan.xyz/mainnet/tx/0xdef456');
  });
});

describe('jsonMode', () => {
  beforeEach(() => {
    setJsonMode(false);
  });

  it('defaults to false', () => {
    expect(isJsonMode()).toBe(false);
  });

  it('can be enabled', () => {
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
  });

  it('can be toggled back', () => {
    setJsonMode(true);
    setJsonMode(false);
    expect(isJsonMode()).toBe(false);
  });
});
