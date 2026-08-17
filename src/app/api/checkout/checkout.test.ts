import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/checkout/route';
import { NextRequest } from 'next/server';
import * as ld from '@/lib/ld';

// Mock the LD module
vi.mock('@/lib/ld');

// Mock the products module
vi.mock('@/lib/products', () => ({
  getProduct: vi.fn((id: string) => ({
    id,
    name: 'Test Product',
    basePrice: 100.0,
    description: 'Test',
  })),
}));

describe('POST /api/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('flag: enable-discount-codes (control path)', () => {
    beforeEach(() => {
      // Control variation: discount codes are NOT enabled
      vi.mocked(ld.stringVariation).mockResolvedValue('control');
      vi.mocked(ld.track).mockResolvedValue(undefined);
    });

    it('rejects discount code when flag is control', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
        discountCode: 'SAVE10',
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Discount codes are not currently enabled');
    });

    it('tracks feature_disabled error when discount attempted in control', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
        discountCode: 'SAVE10',
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      await POST(request);

      expect(ld.track).toHaveBeenCalledWith(
        'enable-discount-codes-error',
        'user@example.com',
        undefined,
        expect.objectContaining({
          reason: 'feature_disabled',
          discountCode: 'SAVE10',
        }),
      );
    });

    it('completes checkout without discount when no discount code provided', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.orderId).toBeDefined();
      expect(data.orderTotal).toBe(100.0);
      expect(data.discountApplied).toBeNull();
      expect(data.subtotal).toBe(100.0);
    });

    it('tracks checkout-completed event in control with no discount', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      await POST(request);

      expect(ld.track).toHaveBeenCalledWith(
        'checkout-completed',
        'user@example.com',
        100.0,
        expect.objectContaining({
          subtotal: 100.0,
          discountCode: null,
          discountAmount: 0,
          itemCount: 1,
        }),
      );
    });
  });

  describe('flag: enable-discount-codes (v1 treatment path)', () => {
    beforeEach(() => {
      // v1 variation: discount codes ARE enabled
      vi.mocked(ld.stringVariation).mockResolvedValue('v1');
      vi.mocked(ld.track).mockResolvedValue(undefined);
    });

    it('applies valid discount code in v1', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
        discountCode: 'SAVE10',
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.orderId).toBeDefined();
      expect(data.subtotal).toBe(100.0);
      expect(data.discountApplied).toEqual({
        code: 'SAVE10',
        amount: 10.0, // 10% of 100
      });
      expect(data.orderTotal).toBe(90.0); // 100 - 10
    });

    it('rejects invalid discount code in v1', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
        discountCode: 'INVALID123',
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid discount code: INVALID123');
    });

    it('tracks invalid_code error in v1', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
        discountCode: 'BADCODE',
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      await POST(request);

      expect(ld.track).toHaveBeenCalledWith(
        'enable-discount-codes-error',
        'user@example.com',
        undefined,
        expect.objectContaining({
          reason: 'invalid_code',
          discountCode: 'BADCODE',
        }),
      );
    });

    it('tracks checkout-completed event in v1 with discount applied', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
        discountCode: 'LAUNCH20',
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      await POST(request);

      expect(ld.track).toHaveBeenCalledWith(
        'checkout-completed',
        'user@example.com',
        80.0, // 100 - 20 (20% discount)
        expect.objectContaining({
          subtotal: 100.0,
          discountCode: 'LAUNCH20',
          discountAmount: 20.0,
          itemCount: 1,
        }),
      );
    });

    it('applies different discount percentages correctly', async () => {
      const testCases = [
        { code: 'SAVE10', expected: { discount: 10.0, total: 90.0 } },
        { code: 'DEMO', expected: { discount: 15.0, total: 85.0 } },
        { code: 'LAUNCH20', expected: { discount: 20.0, total: 80.0 } },
      ];

      for (const testCase of testCases) {
        vi.mocked(ld.track).mockClear();

        const body = {
          items: [{ productId: 'prod-1', quantity: 1 }],
          customer: { email: 'user@example.com', name: 'Test User' },
          address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
          payment: { cardNumber: '4242 4242 4242 4242' },
          discountCode: testCase.code,
        };

        const request = new NextRequest('http://localhost:3000/api/checkout', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(data.discountApplied.amount).toBe(testCase.expected.discount);
        expect(data.orderTotal).toBe(testCase.expected.total);
      }
    });

    it('completes checkout without discount when no code provided in v1', async () => {
      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'user@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.orderTotal).toBe(100.0);
      expect(data.discountApplied).toBeNull();
    });
  });

  describe('flag evaluation behavior', () => {
    it('calls stringVariation with correct flag key and user email', async () => {
      vi.mocked(ld.stringVariation).mockResolvedValue('control');
      vi.mocked(ld.track).mockResolvedValue(undefined);

      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { email: 'test@example.com', name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      await POST(request);

      expect(ld.stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'test@example.com',
        'control',
      );
    });

    it('uses anonymous user key when email not provided', async () => {
      vi.mocked(ld.stringVariation).mockResolvedValue('control');
      vi.mocked(ld.track).mockResolvedValue(undefined);

      const body = {
        items: [{ productId: 'prod-1', quantity: 1 }],
        customer: { name: 'Test User' },
        address: { street: '123 Main', city: 'City', state: 'ST', zip: '12345' },
        payment: { cardNumber: '4242 4242 4242 4242' },
      };

      const request = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      await POST(request);

      expect(ld.stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'anonymous',
        'control',
      );
    });
  });
});
