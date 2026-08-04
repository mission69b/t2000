import { describe, it, expect, vi } from 'vitest';
import {
  ESCROW_JOB_TYPE_MARKER,
  OPENING_TYPE_MARKER,
  resolveCreatedObjectId,
} from './resolve-created.js';

// S.906 SSOT — the one digest→object walk shared by CLI, console and the
// Connect MCP. Best-effort: never throws, undefined on timeout/absence.

function clientWith(objectTypes: Record<string, string>, kind = 'Transaction') {
  return {
    core: {
      waitForTransaction: vi.fn(async () => ({
        $kind: kind,
        [kind]: { objectTypes },
      })),
    },
  } as unknown as Parameters<typeof resolveCreatedObjectId>[0];
}

describe('resolveCreatedObjectId', () => {
  it('finds the Opening by marker', async () => {
    const client = clientWith({
      '0xaaa': '0xpkg::opening::Opening<0xc::usdc::USDC>',
      '0xbbb': '0x2::coin::Coin<0x2::sui::SUI>',
    });
    await expect(
      resolveCreatedObjectId(client, '0xdigest', OPENING_TYPE_MARKER),
    ).resolves.toBe('0xaaa');
  });

  it('finds the escrow Job by marker', async () => {
    const client = clientWith({
      '0xjob': '0xpkg::escrow::Job<0xc::usdc::USDC>',
    });
    await expect(
      resolveCreatedObjectId(client, '0xdigest', ESCROW_JOB_TYPE_MARKER),
    ).resolves.toBe('0xjob');
  });

  it('returns undefined when no object matches', async () => {
    const client = clientWith({ '0xbbb': '0x2::coin::Coin<0x2::sui::SUI>' });
    await expect(
      resolveCreatedObjectId(client, '0xdigest', OPENING_TYPE_MARKER),
    ).resolves.toBeUndefined();
  });

  it('never throws — a timeout resolves to undefined (digest still a receipt)', async () => {
    const client = {
      core: {
        waitForTransaction: vi.fn(async () => {
          throw new Error('timeout');
        }),
      },
    } as unknown as Parameters<typeof resolveCreatedObjectId>[0];
    await expect(
      resolveCreatedObjectId(client, '0xdigest', OPENING_TYPE_MARKER),
    ).resolves.toBeUndefined();
  });
});
