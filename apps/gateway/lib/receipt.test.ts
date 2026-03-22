import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mppx', () => ({
  Receipt: {
    deserialize: vi.fn(),
  },
}));

import { parseReceiptDigest } from './receipt';
import { Receipt } from 'mppx';

const mockDeserialize = vi.mocked(Receipt.deserialize);

describe('parseReceiptDigest', () => {
  beforeEach(() => {
    mockDeserialize.mockReset();
  });

  it('returns null for null header', () => {
    expect(parseReceiptDigest(null)).toBeNull();
  });

  it('returns the reference field from deserialized receipt', () => {
    mockDeserialize.mockReturnValue({ reference: 'digest123' } as never);
    expect(parseReceiptDigest('some-header')).toBe('digest123');
    expect(mockDeserialize).toHaveBeenCalledWith('some-header');
  });

  it('returns null when reference is undefined', () => {
    mockDeserialize.mockReturnValue({} as never);
    expect(parseReceiptDigest('some-header')).toBeNull();
  });

  it('returns null when deserialization throws', () => {
    mockDeserialize.mockImplementation(() => {
      throw new Error('invalid receipt');
    });
    expect(parseReceiptDigest('garbage')).toBeNull();
  });
});
