import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

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
  const validAddress = '0x' + 'a'.repeat(64);

  describe('authentication', () => {
    it('rejects requests without internal key', async () => {
      const res = await post('/api/sponsor/usdc', { address: validAddress });
      expect(res.status).toBe(401);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('rejects requests with wrong internal key', async () => {
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'wrong-key' },
      );
      expect(res.status).toBe(401);
    });

    it('accepts requests with correct internal key', async () => {
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockResolvedValue({ digest: '0xd', agentAddress: validAddress, usdcFunded: '0.25' });
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(200);
      expect(mockSponsorUsdc).toHaveBeenCalledWith(validAddress, 'web', expect.any(String));
    });
  });

  describe('validation', () => {
    it('rejects missing address', async () => {
      const res = await post('/api/sponsor/usdc', {}, { 'x-internal-key': 'test-secret-key' });
      expect(res.status).toBe(400);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('address is required');
    });

    it('rejects invalid Sui address', async () => {
      const res = await post(
        '/api/sponsor/usdc',
        { address: 'not-a-sui-address' },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('INVALID_ADDRESS');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when daily limit reached', async () => {
      mockCheckUsdcDailyLimit.mockResolvedValue(false);
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(429);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('DAILY_LIMIT');
    });

    it('returns 429 when IP limit reached', async () => {
      mockCheckUsdcIpRateLimit.mockResolvedValue(false);
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(429);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('RATE_LIMITED');
    });
  });

  describe('already sponsored', () => {
    it('returns 409 when address already sponsored', async () => {
      mockIsAlreadySponsored.mockResolvedValue(true);
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(409);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('ALREADY_SPONSORED');
    });
  });

  describe('error handling', () => {
    it('returns 409 when service throws ALREADY_SPONSORED', async () => {
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockRejectedValue(new Error('ALREADY_SPONSORED'));
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(409);
    });

    it('returns 503 when service throws SPONSOR_DEPLETED', async () => {
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockRejectedValue(new Error('SPONSOR_DEPLETED'));
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(503);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('SPONSOR_DEPLETED');
    });

    it('returns 500 for unknown errors', async () => {
      mockIsAlreadySponsored.mockResolvedValue(false);
      mockSponsorUsdc.mockRejectedValue(new Error('Network timeout'));
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(500);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('SPONSOR_FAILED');
    });
  });

  describe('paused', () => {
    it('returns 503 when sponsor is paused', async () => {
      mockIsSponsorPaused.mockReturnValue(true);
      const res = await post(
        '/api/sponsor/usdc',
        { address: validAddress },
        { 'x-internal-key': 'test-secret-key' },
      );
      expect(res.status).toBe(503);
      const data = (await res.json()) as ApiError;
      expect(data.error).toBe('SPONSOR_PAUSED');
    });
  });
});
