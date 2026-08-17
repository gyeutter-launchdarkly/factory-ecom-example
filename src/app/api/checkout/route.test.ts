import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the flag evaluation and other dependencies before importing the route
const stringVariation = vi.fn();
const boolVariation = vi.fn();
const track = vi.fn();

vi.mock('@/lib/ld', () => ({
  stringVariation: (...args: unknown[]) => stringVariation(...args),
  boolVariation: (...args: unknown[]) => boolVariation(...args),
  track: (...args: unknown[]) => track(...args),
}));

vi.mock('@/lib/products', () => ({
  getProduct: (id: string) => {
    const products: Record<string, any> = {
      'product-1': { id: 'product-1', name: 'Test Product', basePrice: 100 },
      'product-2': { id: 'product-2', name: 'Another Product', basePrice: 50 },
    };
    return products[id];
  },
}));

// Import after mocks are set up
import { POST } from '@/app/api/checkout/route';

describe('POST /api/checkout', () => {
  beforeEach(() => {
    stringVariation.mockReset();
    boolVariation.mockReset();
    track.mockReset();
  });

  const createRequest = (body: any) => {
    return new Request('http://localhost:3000/api/checkout', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const validCheckoutBody = {
    items: [{ productId: 'product-1', quantity: 2 }],
    customer: {
      name: 'Jane Smith',
      email: 'jane@example.com',
      address: '123 Main St',
      city: 'San Francisco',
      zip: '94105',
    },
    payment: {
      cardNumber: '4242 4242 4242 4242',
    },
  };

  describe('control path (flag off)', () => {
    beforeEach(() => {
      stringVariation.mockResolvedValue('control');
    });

    it('completes checkout without discount when flag is off', async () => {
      const response = await POST(createRequest(validCheckoutBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.orderId).toMatch(/^ORD-/);
      expect(data.subtotal).toBe(200); // 2 × $100
      expect(data.orderTotal).toBe(200);
      expect(data.discountApplied).toBeNull();
    });

    it('ignores discount code when flag is off', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: 'SAVE10',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subtotal).toBe(200);
      expect(data.orderTotal).toBe(200);
      expect(data.discountApplied).toBeNull();
    });

    it('tracks checkout without discount metrics when flag is off', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: 'SAVE10',
        }),
      );

      expect(response.status).toBe(200);
      expect(track).toHaveBeenCalledWith(
        'checkout-completed',
        'jane@example.com',
        200, // orderTotal
        expect.objectContaining({
          discountCode: null,
          discountAmount: 0,
        }),
      );
    });
  });

  describe('v1 variation (flag on)', () => {
    beforeEach(() => {
      stringVariation.mockResolvedValue('v1');
    });

    it('applies SAVE10 discount when flag is on', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: 'SAVE10',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subtotal).toBe(200);
      expect(data.discountApplied).toEqual({
        code: 'SAVE10',
        amount: 20, // 10% of 200
      });
      expect(data.orderTotal).toBe(180);
    });

    it('applies LAUNCH20 discount (20%) when flag is on', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: 'LAUNCH20',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.discountApplied).toEqual({
        code: 'LAUNCH20',
        amount: 40, // 20% of 200
      });
      expect(data.orderTotal).toBe(160);
    });

    it('applies DEMO discount (15%) when flag is on', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: 'DEMO',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.discountApplied).toEqual({
        code: 'DEMO',
        amount: 30, // 15% of 200
      });
      expect(data.orderTotal).toBe(170);
    });

    it('is case-insensitive for discount codes', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: 'save10',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.discountApplied?.code).toBe('SAVE10');
    });

    it('rejects invalid discount code with 400 error', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: 'INVALID',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/Invalid discount code/);
    });

    it('tracks discount metrics when discount is applied', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: 'SAVE10',
        }),
      );

      expect(response.status).toBe(200);
      expect(track).toHaveBeenCalledWith(
        'checkout-completed',
        'jane@example.com',
        180, // orderTotal after discount
        expect.objectContaining({
          discountCode: 'SAVE10',
          discountAmount: 20,
        }),
      );
    });

    it('completes checkout without discount when no code is provided', async () => {
      const response = await POST(createRequest(validCheckoutBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.discountApplied).toBeNull();
      expect(data.orderTotal).toBe(data.subtotal);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      stringVariation.mockResolvedValue('v1');
    });

    it('handles empty discount code gracefully', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: '',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.discountApplied).toBeNull();
    });

    it('handles whitespace-only discount code as invalid', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          discountCode: '   ',
        }),
      );
      const data = await response.json();

      // Whitespace-only code will be uppercased but won't match any valid codes
      expect(response.status).toBe(400);
      expect(data.error).toMatch(/Invalid discount code/);
    });

    it('uses email as user key for flag evaluation', async () => {
      await POST(createRequest(validCheckoutBody));

      expect(stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'jane@example.com',
        'control',
      );
    });

    it('uses anonymous as user key when no email provided', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          customer: { ...validCheckoutBody.customer, email: '' },
        }),
      );

      expect(response.status).toBe(200);
      expect(stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'anonymous',
        'control',
      );
    });

    it('handles multiple items in cart', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          items: [
            { productId: 'product-1', quantity: 2 },
            { productId: 'product-2', quantity: 1 },
          ],
          discountCode: 'SAVE10',
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subtotal).toBe(250); // 2*100 + 1*50
      expect(data.discountApplied?.amount).toBe(25); // 10% of 250
      expect(data.orderTotal).toBe(225);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      stringVariation.mockResolvedValue('v1');
    });

    it('returns 400 for invalid request body', async () => {
      const response = await POST(
        new Request('http://localhost:3000/api/checkout', {
          method: 'POST',
          body: 'invalid json',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request body');
    });

    it('returns 400 for empty cart', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          items: [],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cart is empty');
    });

    it('returns 400 for unknown product', async () => {
      const response = await POST(
        createRequest({
          ...validCheckoutBody,
          items: [{ productId: 'unknown-product', quantity: 1 }],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/Unknown product/);
    });
  });
});
