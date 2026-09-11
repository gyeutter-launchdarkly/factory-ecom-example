import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { stringVariation } = vi.hoisted(() => ({
  stringVariation: vi.fn(),
}));

vi.mock('@/lib/ld', () => ({
  stringVariation,
  track: vi.fn(),
  boolVariation: async (_flag: string, _user: string, defaultValue: boolean) =>
    defaultValue,
}));

import { GET } from './route';

const get = () =>
  GET(
    new NextRequest('http://localhost/api/flags/enable-discount-codes', {
      method: 'GET',
      headers: {
        cookie: 'factory-shopper=test-shopper-12345',
      },
    }),
  );

beforeEach(() => {
  stringVariation.mockReset().mockResolvedValue('control');
});

describe('/api/flags/enable-discount-codes', () => {
  describe('[CONTROL PATH]', () => {
    beforeEach(() => {
      stringVariation.mockResolvedValue('control');
    });

    it('returns enabled: false when flag is control', async () => {
      const response = await get();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.enabled).toBe(false);
    });

    it('evaluates the flag with correct user key', async () => {
      await get();
      expect(stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'test-shopper-12345',
        'control',
      );
    });
  });

  describe('[TREATMENT PATH: v1]', () => {
    beforeEach(() => {
      stringVariation.mockResolvedValue('v1');
    });

    it('returns enabled: true when flag is v1', async () => {
      const response = await get();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.enabled).toBe(true);
    });

    it('evaluates flag with correct user key in treatment', async () => {
      await get();
      expect(stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'test-shopper-12345',
        'control',
      );
    });
  });
});
