import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const mockCheckUsdcRateLimit = vi.fn();
const mockCheckUsdcDailyLimit = vi.fn();
const mockCheckUsdcIpRateLimit = vi.fn();
const mockIsAlreadySponsored = vi.fn();
const mockIsSponsorPaused = vi.fn();
const mockSponsorUsdc = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockCheckDailyLimit = vi.fn();
const mockIsAlreadyFunded = vi.fn();
const mockSponsorWalletInit = vi.fn();
const mockCreateChallenge = vi.fn();
const mockFormatChallenge = vi.fn();
const mockVerifyStamp = vi.fn();

vi.mock('../services/usdcSponsor.js', () => ({
  checkUsdcSponsorRateLimit: (...args: unknown[]) => mockCheckUsdcRateLimit(...args),
  checkUsdcDailyLimit: (...args: unknown[]) => mockCheckUsdcDailyLimit(...args),
  checkUsdcIpRateLimit: (...args: unknown[]) => mockCheckUsdcIpRateLimit(...args),
  isAlreadySponsored: (...args: unknown[]) => mockIsAlreadySponsored(...args),
  isSponsorPaused: (...args: unknown[]) => mockIsSponsorPaused(...args),
  sponsorUsdc: (...args: unknown[]) => mockSponsorUsdc(...args),
}));

vi.mock('../services/sponsor.js', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  checkDailyLimit: (...args: unknown[]) => mockCheckDailyLimit(...args),
  isAlreadyFunded: (...args: unknown[]) => mockIsAlreadyFunded(...args),
  sponsorWalletInit: (...args: unknown[]) => mockSponsorWalletInit(...args),
}));

vi.mock('../lib/hashcash.js', () => ({
  createChallenge: (...args: unknown[]) => mockCreateChallenge(...args),
  formatChallenge: (...args: unknown[]) => mockFormatChallenge(...args),
  verifyStamp: (...args: unknown[]) => mockVerifyStamp(...args),
}));

let app: Hono;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('SPONSOR_INTERNAL_KEY', 'test-secret-key');

  mockIsSponsorPaused.mockReturnValue(false);
  mockCheckUsdcDailyLimit.mockResolvedValue(true);
  mockCheckUsdcIpRateLimit.mockResolvedValue(true);
  mockCheckDailyLimit.mockResolvedValue(true);
  mockIsAlreadyFunded.mockResolvedValue(false);

  vi.resetModules();
  const { sponsor } = await import('./sponsor.js');
  app = new Hono();
  app.route('/', sponsor);
});

interface ApiError {
  error: string;
  message?: string;
  challenge?: string;
}

function post(path: string, body: Record<string, unknown>, headers?: Record<string, string>) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sponsor/usdc', () => {
  describe('validation', () => {
    it('rejects missing address', async () => {
      const res = await post('/api/sponsor/usdc', {});
      expect(res.status).toBe(400);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('address is required');
    });

    it('rejects invalid Sui address', async () => {
      const res = await post('/api/sponsor/usdc', { address: 'not-a-sui-address' });
      expect(res.status).toBe(400);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('INVALID_ADDRESS');
    });
  });

  describe('web source (x-internal-key auth)', () => {
    const validAddress = '0x' + 'a'.repeat(64);

    it('rejects missing internal key', async () => {
      mockIsAlreadySponsored.mockResolvedValue(false);
      const res = await post('/api/sponsor/usdc', { address: validAddress, source: 'web' });
      expect(res.status).toBe(401);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('rejects wrong internal key', async () => {
      mockIsAlreadySponsored.mockResolvedValue(false);
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress, source: 'web' },
        { 'x-internal-key': 'wrong-key' },
      );
      expect(res.status).toBe(401);
    });

    it('accepts correct internal key', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(true);
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockResolvedValue({ digest: '0xdigest', agentAddress: validAddress, usdcFunded: '1' });
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress, source: 'web' },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(200);
      expect(mockSponsorUsdc).toHaveBeenCalledWith(validAddress, 'web', expect.any(String));
    });
  });

  describe('CLI source (hashcash auth)', () => {
    const validAddress = '0x' + 'b'.repeat(64);

    it('defaults to cli source when not specified', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(true);
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockResolvedValue({ digest: '0xd', agentAddress: validAddress, usdcFunded: '1' });
      const res = await post('/api/sponsor/usdc', { address: validAddress });
      expect(res.status).toBe(200);
      expect(mockSponsorUsdc).toHaveBeenCalledWith(validAddress, 'cli', expect.any(String));
    });

    it('allows request within rate limit without proof', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(true);
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockResolvedValue({ digest: '0xd', agentAddress: validAddress, usdcFunded: '1' });
      const res = await post('/api/sponsor/usdc', { address: validAddress, source: 'cli' });
      expect(res.status).toBe(200);
    });

    it('returns challenge when rate-limited without proof', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(false);
      mockCreateChallenge.mockReturnValue({ resource: validAddress, bits: 20, date: '20260219', rand: 'abc' });
      mockFormatChallenge.mockReturnValue('1:20:20260219:' + validAddress + '::abc:');

      const res = await post('/api/sponsor/usdc', { address: validAddress, source: 'cli' });
      expect(res.status).toBe(429);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('RATE_LIMITED');
      expect(data.challenge).toBeTruthy();
    });

    it('rejects invalid proof when rate-limited', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(false);
      mockVerifyStamp.mockReturnValue(false);
      const res = await post('/api/sponsor/usdc', {
        address: validAddress,
        source: 'cli',
        proof: 'invalid-proof',
      });
      expect(res.status).toBe(403);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('INVALID_PROOF');
    });

    it('accepts valid proof when rate-limited', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(false);
      mockVerifyStamp.mockReturnValue(true);
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockResolvedValue({ digest: '0xd', agentAddress: validAddress, usdcFunded: '1' });
      const res = await post('/api/sponsor/usdc', {
        address: validAddress,
        source: 'cli',
        proof: 'valid-proof',
      });
      expect(res.status).toBe(200);
    });
  });

  describe('already sponsored', () => {
    const validAddress = '0x' + 'c'.repeat(64);

    it('returns 409 when address already sponsored', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(true);
      mockIsAlreadySponsored.mockResolvedValue(true);
      const res = await post('/api/sponsor/usdc', { address: validAddress });
      expect(res.status).toBe(409);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('ALREADY_SPONSORED');
    });
  });

  describe('error handling', () => {
    const validAddress = '0x' + 'd'.repeat(64);

    it('returns 409 when service throws ALREADY_SPONSORED', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(true);
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockRejectedValue(new Error('ALREADY_SPONSORED'));
      const res = await post('/api/sponsor/usdc', { address: validAddress });
      expect(res.status).toBe(409);
    });

    it('returns 503 when service throws SPONSOR_DEPLETED', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(true);
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockRejectedValue(new Error('SPONSOR_DEPLETED'));
      const res = await post('/api/sponsor/usdc', { address: validAddress });
      expect(res.status).toBe(503);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('SPONSOR_DEPLETED');
    });

    it('returns 500 for unknown errors', async () => {
      mockCheckUsdcRateLimit.mockResolvedValue(true);
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockRejectedValue(new Error('Network timeout'));
      const res = await post('/api/sponsor/usdc', { address: validAddress });
      expect(res.status).toBe(500);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('SPONSOR_FAILED');
    });
  });
});
