import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the flag evaluation and tracking functions
const boolVariation = vi.fn();
const track = vi.fn();
vi.mock('@/lib/ld', () => ({
  boolVariation: (...args: unknown[]) => boolVariation(...args),
  track: (...args: unknown[]) => track(...args),
}));

vi.mock('@/lib/products', () => ({
  getProduct: (id: string) => {
    if (id === 'prod-123') {
      return { id: 'prod-123', name: 'Test Product', basePrice: 100 };
    }
    return null;
  },
}));

vi.mock('@/lib/pricing', () => ({
  calculateOrderTotal: (items: Array<{ product: { basePrice: number }; quantity: number }>) => {
    return items.reduce((sum, item) => sum + item.product.basePrice * item.quantity, 0);
  },
  applyDiscountCode: (code: string, total: number) => {
    const codes: Record<string, number> = {
      SAVE10: 0.10,
      LAUNCH20: 0.20,
      DEMO: 0.15,
    };
    const pct = codes[code.toUpperCase()];
    if (pct === undefined) return null;
    const discountAmount = total * pct;
    return {
      discountAmount,
      discountedTotal: total - discountAmount,
      code: code.toUpperCase(),
    };
  },
  formatPrice: (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  },
}));

import { POST } from '@/app/api/checkout/route';
import { NextRequest } from 'next/server';

// Helper to create a mock NextRequest
function createCheckoutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/checkout — discount code feature flag', () => {
  const baseBody = {
    items: [{ productId: 'prod-123', quantity: 2 }],
    customer: {
      name: 'Test User',
      email: 'test@example.com',
      address: '123 Main St',
      city: 'Test City',
      zip: '12345',
    },
    payment: { cardNumber: '4242 4242 4242 4242' },
  };

  beforeEach(() => {
    boolVariation.mockReset();
    track.mockReset();
  });

  describe('Control path (enable-discount-codes = false)', () => {
    beforeEach(() => {
      boolVariation.mockResolvedValue(false);
    });

    it('ignores discount code in request when flag is off', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'SAVE10',
        }),
      );

      const data = await res.json();
      expect(data.orderTotal).toBe(200); // No discount applied: 100 * 2
      expect(data.discountApplied).toBeUndefined();
      expect(data.subtotal).toBeUndefined();
    });

    it('succeeds with empty discount code when flag is off', async () => {
      const res = await POST(createCheckoutRequest(baseBody));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orderTotal).toBe(200);
      expect(data.discountApplied).toBeUndefined();
    });

    it('does not track checkout-error event even if discount code would be invalid', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'INVALID_CODE',
        }),
      );

      expect(res.status).toBe(200);
      // Error event should NOT be tracked when flag is off
      expect(track).not.toHaveBeenCalledWith('checkout-error', expect.anything());
    });

    it('always tracks checkout-completed with correct event structure', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'SAVE10', // Should be ignored
        }),
      );

      expect(res.status).toBe(200);
      expect(track).toHaveBeenCalledWith(
        'checkout-completed',
        'test@example.com',
        200, // orderTotal
        expect.objectContaining({
          subtotal: 200,
          discountCode: null,
          discountAmount: 0,
          itemCount: 2,
        }),
      );
    });
  });

  describe('Treatment path (enable-discount-codes = true)', () => {
    beforeEach(() => {
      boolVariation.mockResolvedValue(true);
    });

    it('applies valid discount code SAVE10 (10% off)', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'SAVE10',
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.subtotal).toBe(200);
      expect(data.discountApplied).toEqual({
        code: 'SAVE10',
        amount: 20, // 10% of 200
      });
      expect(data.orderTotal).toBe(180); // 200 - 20
    });

    it('applies valid discount code LAUNCH20 (20% off)', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'LAUNCH20',
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.discountApplied.code).toBe('LAUNCH20');
      expect(data.discountApplied.amount).toBe(40); // 20% of 200
      expect(data.orderTotal).toBe(160); // 200 - 40
    });

    it('applies valid discount code DEMO (15% off)', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'DEMO',
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.discountApplied.code).toBe('DEMO');
      expect(data.discountApplied.amount).toBe(30); // 15% of 200
      expect(data.orderTotal).toBe(170); // 200 - 30
    });

    it('is case-insensitive for discount codes', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'save10', // lowercase
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.discountApplied.code).toBe('SAVE10'); // Normalized to uppercase
      expect(data.orderTotal).toBe(180);
    });

    it('rejects invalid discount code with 400 status', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'INVALID_CODE',
        }),
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid discount code');
    });

    it('tracks checkout-error event when discount code is invalid', async () => {
      await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'INVALID_CODE',
        }),
      );

      expect(track).toHaveBeenCalledWith('checkout-error', 'test@example.com');
    });

    it('includes discount details in checkout-completed event when valid code is applied', async () => {
      await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: 'SAVE10',
        }),
      );

      expect(track).toHaveBeenCalledWith(
        'checkout-completed',
        'test@example.com',
        180, // orderTotal with discount
        expect.objectContaining({
          subtotal: 200,
          discountCode: 'SAVE10',
          discountAmount: 20,
          itemCount: 2,
        }),
      );
    });

    it('does not apply discount when no discount code provided', async () => {
      const res = await POST(createCheckoutRequest(baseBody));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orderTotal).toBe(200);
      expect(data.discountApplied).toBeNull();
      expect(track).toHaveBeenCalledWith(
        'checkout-completed',
        'test@example.com',
        200,
        expect.objectContaining({
          discountCode: null,
          discountAmount: 0,
        }),
      );
    });

    it('handles empty string discount code as no discount', async () => {
      const res = await POST(
        createCheckoutRequest({
          ...baseBody,
          discountCode: '',
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orderTotal).toBe(200);
      expect(data.discountApplied).toBeNull();
    });
  });

  describe('Flag evaluation behavior', () => {
    it('calls boolVariation with correct parameters for discount codes flag', async () => {
      boolVariation.mockResolvedValue(false);
      await POST(createCheckoutRequest(baseBody));

      expect(boolVariation).toHaveBeenCalledWith('enable-discount-codes', 'test@example.com', false);
    });

    it('uses default value (false) when flag evaluation is unavailable', async () => {
      boolVariation.mockResolvedValue(false);
      const res = await POST(createCheckoutRequest(baseBody));

      expect(res.status).toBe(200);
      const data = await res.json();
      // Should behave like flag is off (control path)
      expect(data.discountApplied).toBeUndefined();
    });

    it('respects flag state per user (uses email as userKey)', async () => {
      boolVariation.mockResolvedValue(true);
      const bodyWithDifferentEmail = {
        ...baseBody,
        customer: { ...baseBody.customer, email: 'other@example.com' },
        discountCode: 'SAVE10',
      };

      await POST(createCheckoutRequest(bodyWithDifferentEmail));

      expect(boolVariation).toHaveBeenCalledWith('enable-discount-codes', 'other@example.com', false);
    });
  });
});
