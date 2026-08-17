import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/checkout/flags/route';
import { NextRequest } from 'next/server';
import * as ld from '@/lib/ld';

// Mock the LD module
vi.mock('@/lib/ld');

describe('GET /api/checkout/flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('flag: enable-discount-codes (control path)', () => {
    beforeEach(() => {
      // Control variation: discount codes are NOT enabled
      vi.mocked(ld.stringVariation).mockResolvedValue('control');
    });

    it('returns enableDiscountCodes: false when flag is control', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/checkout/flags?userKey=user@example.com',
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.flags.enableDiscountCodes).toBe(false);
    });

    it('uses anonymous user key when not provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/checkout/flags');

      await GET(request);

      expect(ld.stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'anonymous',
        'control',
      );
    });

    it('evaluates flag with provided userKey', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/checkout/flags?userKey=test-user@example.com',
      );

      await GET(request);

      expect(ld.stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'test-user@example.com',
        'control',
      );
    });
  });

  describe('flag: enable-discount-codes (v1 treatment path)', () => {
    beforeEach(() => {
      // v1 variation: discount codes ARE enabled
      vi.mocked(ld.stringVariation).mockResolvedValue('v1');
    });

    it('returns enableDiscountCodes: true when flag is v1', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/checkout/flags?userKey=user@example.com',
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.flags.enableDiscountCodes).toBe(true);
    });

    it('correctly maps v1 variation to boolean true', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/checkout/flags?userKey=user@example.com',
      );

      const response = await GET(request);
      const data = await response.json();

      expect(typeof data.flags.enableDiscountCodes).toBe('boolean');
      expect(data.flags.enableDiscountCodes).toBe(true);
    });

    it('evaluates flag with provided userKey in v1', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/checkout/flags?userKey=v1-user@example.com',
      );

      await GET(request);

      expect(ld.stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'v1-user@example.com',
        'control',
      );
    });
  });

  describe('flag variation mapping', () => {
    it('treats only "v1" as true', async () => {
      const testCases = [
        { variation: 'v1', expected: true },
        { variation: 'control', expected: false },
        { variation: 'v2', expected: false },
        { variation: 'off', expected: false },
      ];

      for (const testCase of testCases) {
        vi.mocked(ld.stringVariation).mockResolvedValueOnce(testCase.variation);

        const request = new NextRequest(
          'http://localhost:3000/api/checkout/flags?userKey=test@example.com',
        );

        const response = await GET(request);
        const data = await response.json();

        expect(data.flags.enableDiscountCodes).toBe(
          testCase.expected,
          `variation "${testCase.variation}" should map to ${testCase.expected}`,
        );
      }
    });
  });

  describe('response structure', () => {
    beforeEach(() => {
      vi.mocked(ld.stringVariation).mockResolvedValue('control');
    });

    it('returns properly structured flags object', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/checkout/flags?userKey=user@example.com',
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('flags');
      expect(data.flags).toHaveProperty('enableDiscountCodes');
      expect(typeof data.flags.enableDiscountCodes).toBe('boolean');
    });

    it('returns JSON response with correct status', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/checkout/flags?userKey=user@example.com',
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
    });
  });
});
