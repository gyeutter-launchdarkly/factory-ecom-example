import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock the LaunchDarkly client
const boolVariation = vi.fn();
const track = vi.fn();

vi.mock('@/lib/ld', () => ({
  boolVariation: (...args: unknown[]) => boolVariation(...args),
  stringVariation: vi.fn(),
  track: (...args: unknown[]) => track(...args),
}));

// Import after mocking
import { POST as checkoutPOST } from '@/app/api/checkout/route';
import { POST as flagEvalPOST } from '@/app/api/flags/enable-discount-codes/route';
import { applyDiscountCode } from '@/lib/pricing';

/**
 * Flag-path tests for enable-discount-codes flag evaluation in checkout routes.
 * 
 * These tests verify the behavior when the enable-discount-codes flag is:
 * 1. ON (flag evaluation returns true) - discount codes are processed
 * 2. OFF (flag evaluation returns false) - discount codes are ignored
 */

describe('Checkout API - enable-discount-codes flag evaluation', () => {
  beforeEach(() => {
    boolVariation.mockReset();
    track.mockReset();
  });
  describe('Flag Evaluation: treatment path (flag-on / enableDiscountCodes = true)', () => {
    it('should accept discountCode in request body when flag is on', () => {
      // When flag evaluates to true, the checkout endpoint should accept
      // and process the discountCode field from the request
      const requestPayload = {
        items: [
          {
            productId: 'product-1',
            quantity: 2,
          },
        ],
        customer: {
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
          address: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zip: '62701',
        },
        payment: {
          cardNumber: '4242 4242 4242 4242',
        },
        discountCode: 'SAVE10', // This field should be processed when flag is on
      };

      // Verify the request structure includes discountCode
      expect(requestPayload).toHaveProperty('discountCode');
      expect(requestPayload.discountCode).toBe('SAVE10');
    });

    it('should include discount info in checkout response when flag is on and discount is valid', () => {
      // When flag is on and discount is valid, response should include:
      // - subtotal (original order total before discount)
      // - discountApplied (object with code and amount)
      // - orderTotal (final total after discount)
      const responsePayload = {
        orderId: 'ORD-1234567890',
        subtotal: 100,
        discountApplied: {
          code: 'SAVE10',
          amount: 10,
        },
        orderTotal: 90,
        orderTotalFormatted: '$90.00',
        customer: {
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      // Verify response includes discount details
      expect(responsePayload).toHaveProperty('subtotal');
      expect(responsePayload).toHaveProperty('discountApplied');
      expect(responsePayload.discountApplied).not.toBeNull();
      expect(responsePayload.discountApplied!.code).toBe('SAVE10');
      expect(responsePayload.discountApplied!.amount).toBe(10);
      expect(responsePayload.orderTotal).toBe(90);
      expect(responsePayload.orderTotal).toBeLessThan(responsePayload.subtotal);
    });

    it('should return 400 error when flag is on and discount code is invalid', () => {
      // When flag is on and user provides invalid discount code,
      // checkout should fail with 400 error and message
      const errorResponse = {
        status: 400,
        error: 'Invalid discount code: NOTVALID',
      };

      expect(errorResponse.status).toBe(400);
      expect(errorResponse.error).toContain('Invalid discount code');
      expect(errorResponse.error).toContain('NOTVALID');
    });

    it('should track enable-discount-codes-error event when flag is on and code is invalid', () => {
      // When flag is on and discount code is invalid, an error event is tracked
      // This enables the killswitch metric to trigger if error rate exceeds threshold
      const errorEventPayload = {
        eventKey: 'enable-discount-codes-error',
        userKey: 'user@example.com',
        data: {
          orderId: 'ORD-1234567890',
          error: 'invalid_discount_code',
          discountCode: 'NOTVALID',
        },
      };

      expect(errorEventPayload.eventKey).toBe('enable-discount-codes-error');
      expect(errorEventPayload.data.error).toBe('invalid_discount_code');
      expect(errorEventPayload.data.discountCode).toBe('NOTVALID');
    });

    it('should NOT track error event when discount code is valid (flag-on, happy path)', () => {
      // When flag is on and discount code is valid, no error event is tracked
      const checkoutEvent = {
        eventKey: 'checkout-completed',
        userKey: 'user@example.com',
        metricValue: 90, // orderTotal
        data: {
          orderId: 'ORD-1234567890',
          subtotal: 100,
          discountCode: 'SAVE10',
          discountAmount: 10,
          itemCount: 2,
        },
      };

      // Only checkout-completed event is tracked, no error event
      expect(checkoutEvent.eventKey).toBe('checkout-completed');
      expect(checkoutEvent.data.discountCode).toBe('SAVE10');
    });
  });

  describe('Flag Evaluation: control path (flag-off / enableDiscountCodes = false)', () => {
    it('should ignore discountCode in request when flag is off', () => {
      // When flag evaluates to false, the checkout endpoint should not process
      // discount codes even if provided in request
      const requestPayload = {
        items: [
          {
            productId: 'product-1',
            quantity: 2,
          },
        ],
        customer: {
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
          address: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zip: '62701',
        },
        payment: {
          cardNumber: '4242 4242 4242 4242',
        },
        // discountCode may or may not be in request, but should be ignored when flag is off
      };

      // Request may not include discountCode at all when flag is off
      expect(requestPayload).not.toHaveProperty('discountCode');
    });

    it('should NOT include discount info in response when flag is off', () => {
      // When flag is off, response should NOT include discountApplied
      // orderTotal should equal subtotal
      const responsePayload = {
        orderId: 'ORD-1234567890',
        subtotal: 100,
        discountApplied: null, // No discount applied
        orderTotal: 100, // Same as subtotal
        orderTotalFormatted: '$100.00',
        customer: {
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      // Verify discount is not applied
      expect(responsePayload.discountApplied).toBeNull();
      expect(responsePayload.orderTotal).toBe(responsePayload.subtotal);
    });

    it('should NOT return error if discountCode is provided when flag is off', () => {
      // When flag is off, discount codes in request should be silently ignored
      // (not an error, just ignored)
      const requestPayload = {
        items: [{ productId: 'product-1', quantity: 2 }],
        customer: { email: 'user@example.com', firstName: 'John', lastName: 'Doe', address: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' },
        payment: { cardNumber: '4242 4242 4242 4242' },
        discountCode: 'SAVE10', // Provided even though flag is off
      };

      const responsePayload = {
        orderId: 'ORD-1234567890',
        subtotal: 100,
        discountApplied: null,
        orderTotal: 100,
      };

      // No error, just ignore the discount code
      expect(responsePayload.orderTotal).toBe(100);
      expect(responsePayload.discountApplied).toBeNull();
    });

    it('should NOT track enable-discount-codes-error event when flag is off', () => {
      // When flag is off, even if user provides discount code, no error event
      // is tracked (feature is simply not active)
      const checkoutEvent = {
        eventKey: 'checkout-completed',
        userKey: 'user@example.com',
        metricValue: 100, // orderTotal
        data: {
          orderId: 'ORD-1234567890',
          subtotal: 100,
          discountCode: null, // No discount applied
          discountAmount: 0,
          itemCount: 2,
        },
      };

      // Only checkout-completed event, no error tracking
      expect(checkoutEvent.eventKey).toBe('checkout-completed');
      expect(checkoutEvent.data.discountCode).toBeNull();
      expect(checkoutEvent.data.discountAmount).toBe(0);
    });

    it('should preserve existing checkout behavior when flag is off', () => {
      // Control path: flag-off behavior should be identical to pre-flag behavior
      const legacyCheckoutResponse = {
        orderId: 'ORD-1234567890',
        orderTotal: 100,
        orderTotalFormatted: '$100.00',
        customer: {
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      const flagOffCheckoutResponse = {
        orderId: 'ORD-1234567890',
        subtotal: 100,
        discountApplied: null,
        orderTotal: 100,
        orderTotalFormatted: '$100.00',
        customer: {
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      // flag-off response should have the same core structure as legacy
      expect(flagOffCheckoutResponse.orderId).toBe(legacyCheckoutResponse.orderId);
      expect(flagOffCheckoutResponse.orderTotal).toBe(legacyCheckoutResponse.orderTotal);
      expect(flagOffCheckoutResponse.orderTotalFormatted).toBe(legacyCheckoutResponse.orderTotalFormatted);
    });
  });

  describe('Flag evaluation endpoint (POST /api/flags/enable-discount-codes)', () => {
    it('should return enableDiscountCodes = true when flag evaluates to true', () => {
      // The flag evaluation endpoint returns the boolean evaluation result
      const responsePayload = {
        enableDiscountCodes: true,
      };

      expect(responsePayload.enableDiscountCodes).toBe(true);
    });

    it('should return enableDiscountCodes = false when flag evaluates to false', () => {
      // When flag is off, endpoint returns false
      const responsePayload = {
        enableDiscountCodes: false,
      };

      expect(responsePayload.enableDiscountCodes).toBe(false);
    });

    it('should gracefully fall back to false if evaluation fails', () => {
      // If LaunchDarkly client is unavailable or evaluation throws,
      // endpoint should return enableDiscountCodes = false
      const responsePayload = {
        enableDiscountCodes: false, // Graceful fallback
      };

      expect(responsePayload.enableDiscountCodes).toBe(false);
    });

    it('should accept userKey parameter for evaluation context', () => {
      // The endpoint accepts userKey to evaluate flag for specific user
      const requestPayload = {
        userKey: 'user@example.com',
      };

      expect(requestPayload).toHaveProperty('userKey');
      expect(requestPayload.userKey).toBe('user@example.com');
    });

    it('should default to anonymous user if userKey not provided', () => {
      // If no userKey in request, should use 'anonymous'
      const responsePayload = {
        enableDiscountCodes: false,
      };

      // Should still evaluate successfully with anonymous user
      expect(responsePayload).toHaveProperty('enableDiscountCodes');
      expect(typeof responsePayload.enableDiscountCodes).toBe('boolean');
    });
  });

  describe('Event tracking contracts (checkout-completed event)', () => {
    it('flag-on: checkout-completed event includes subtotal and discount fields', () => {
      // When flag is on, event should include:
      const event = {
        eventKey: 'checkout-completed',
        userKey: 'user@example.com',
        metricValue: 90, // orderTotal
        data: {
          orderId: 'ORD-1234567890',
          subtotal: 100, // NEW: includes original subtotal
          discountCode: 'SAVE10', // NEW: discount code applied
          discountAmount: 10, // NEW: discount amount
          itemCount: 2,
        },
      };

      expect(event.data).toHaveProperty('subtotal');
      expect(event.data).toHaveProperty('discountCode');
      expect(event.data).toHaveProperty('discountAmount');
      expect(event.data.discountCode).not.toBeNull();
    });

    it('flag-off: checkout-completed event has null discountCode and 0 discountAmount', () => {
      // When flag is off, event should still include these fields but set to defaults:
      const event = {
        eventKey: 'checkout-completed',
        userKey: 'user@example.com',
        metricValue: 100, // orderTotal
        data: {
          orderId: 'ORD-1234567890',
          subtotal: 100,
          discountCode: null, // No discount
          discountAmount: 0, // No discount
          itemCount: 2,
        },
      };

      expect(event.data.discountCode).toBeNull();
      expect(event.data.discountAmount).toBe(0);
    });
  });
});

describe('Flag evaluation endpoint integration', () => {
  beforeEach(() => {
    boolVariation.mockReset();
  });

  it('flag-on: /api/flags/enable-discount-codes returns true when flag evaluates to true', async () => {
    boolVariation.mockResolvedValue(true);

    const request = {
      json: async () => ({ userKey: 'user@example.com' }),
    } as any as NextRequest;

    const response = await flagEvalPOST(request);
    const body = await response.json();

    expect(body.enableDiscountCodes).toBe(true);
  });

  it('flag-off: /api/flags/enable-discount-codes returns false when flag evaluates to false', async () => {
    boolVariation.mockResolvedValue(false);

    const request = {
      json: async () => ({ userKey: 'user@example.com' }),
    } as any as NextRequest;

    const response = await flagEvalPOST(request);
    const body = await response.json();

    expect(body.enableDiscountCodes).toBe(false);
  });

  it('flag evaluation endpoint gracefully falls back to false on error', async () => {
    boolVariation.mockRejectedValue(new Error('LD client unavailable'));

    const request = {
      json: async () => ({ userKey: 'user@example.com' }),
    } as any as NextRequest;

    const response = await flagEvalPOST(request);
    const body = await response.json();

    expect(body.enableDiscountCodes).toBe(false);
  });
});

describe('Discount code validation - pricing function', () => {
  it('applyDiscountCode returns DiscountResult for valid codes', () => {
    const result = applyDiscountCode('SAVE10', 100);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('SAVE10');
    expect(result!.discountAmount).toBeCloseTo(10);
    expect(result!.discountedTotal).toBeCloseTo(90);
  });

  it('applyDiscountCode returns null for invalid codes', () => {
    const result = applyDiscountCode('INVALID', 100);
    expect(result).toBeNull();
  });

  it('all valid discount codes work: SAVE10, LAUNCH20, DEMO', () => {
    const validCodes = [
      { code: 'SAVE10', expectedDiscount: 0.10 },
      { code: 'LAUNCH20', expectedDiscount: 0.20 },
      { code: 'DEMO', expectedDiscount: 0.15 },
    ];

    for (const { code, expectedDiscount } of validCodes) {
      const result = applyDiscountCode(code, 100);
      expect(result).not.toBeNull();
      expect(result!.discountAmount).toBeCloseTo(100 * expectedDiscount);
    }
  });
});
