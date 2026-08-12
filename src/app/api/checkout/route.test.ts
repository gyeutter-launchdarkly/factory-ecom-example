import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { track, stringVariation } = vi.hoisted(() => ({
  track: vi.fn(),
  stringVariation: vi.fn(),
}));
// Cover the module's whole surface, not just track: the Flag Implementer wires
// `boolVariation`/`stringVariation` into this route during a run, and a mock
// that omits them turns that wiring into `undefined is not a function` — the
// suite goes red at the tests-green-at-handoff gate and the chain halts.
// Flag-off defaults keep every assertion on the control path.
vi.mock('@/lib/ld', () => ({
  track,
  boolVariation: async (
    _flag: string,
    _user: string,
    defaultValue: boolean,
  ) => defaultValue,
  stringVariation,
}));
import { POST } from './route';
const valid = {
  items: [{ productId: 'prod-001', quantity: 2 }],
  customer: {
    name: 'Demo',
    email: 'demo@example.com',
    address: '123 Test St',
    city: 'Test',
    zip: '12345',
  },
  payment: { stripePaymentMethodId: 'pm_demo_4242_test' },
};
const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'factory-shopper=test-user-1234567890',
      },
      body: JSON.stringify(body),
    }),
  );
beforeEach(() => {
  track.mockReset().mockResolvedValue(undefined);
  stringVariation.mockReset().mockResolvedValue('control');
});
describe('checkout', () => {
  it('calculates server-side totals and attributes conversion to the flag context', async () => {
    const response = await post(valid);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.orderTotal).toBe(299.98);
    expect(body.items[0].lineTotal).toBe(299.98);
    expect(track).toHaveBeenCalledWith(
      'checkout-completed',
      'test-user-1234567890',
      299.98,
      expect.any(Object),
    );
    expect(body.payment).toBeUndefined();
  });
  it.each([
    null,
    {},
    { items: [] },
    { ...valid, customer: null },
    { ...valid, customer: { ...valid.customer, email: 'bad' } },
  ])('rejects malformed orders', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(track).not.toHaveBeenCalled();
  });
  it.each([0, -1, 0.5, 101, '2', null])(
    'rejects invalid quantities: %s',
    async (quantity) => {
      expect(
        (await post({ ...valid, items: [{ productId: 'prod-001', quantity }] }))
          .status,
      ).toBe(400);
      expect(track).not.toHaveBeenCalled();
    },
  );
  it('rejects unknown products without tracking conversion', async () => {
    expect(
      (await post({ ...valid, items: [{ productId: 'missing', quantity: 1 }] }))
        .status,
    ).toBe(400);
    expect(track).not.toHaveBeenCalled();
  });

  describe('enable-discount-codes flag [CONTROL PATH]', () => {
    // When flag returns 'control', discount code feature is OFF
    beforeEach(() => {
      stringVariation.mockResolvedValue('control');
    });

    it('ignores discount code when flag is control', async () => {
      const response = await post({
        ...valid,
        discountCode: 'SAVE10',
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      // Control path: discount code is ignored, order total is full price
      expect(body.orderTotal).toBe(299.98);
      expect(body.subtotal).toBe(299.98);
      expect(body.discountApplied).toBeNull();
      // No discount tracking events
      expect(track).not.toHaveBeenCalledWith(
        'enable-discount-codes-success',
        expect.anything(),
      );
      expect(track).not.toHaveBeenCalledWith(
        'enable-discount-codes-error',
        expect.anything(),
      );
      // Conversion tracked with no discount metadata
      expect(track).toHaveBeenCalledWith(
        'checkout-completed',
        'test-user-1234567890',
        299.98,
        expect.objectContaining({
          discountCode: null,
          discountAmount: 0,
        }),
      );
    });

    it('does not apply discount even with valid code in control', async () => {
      const response = await post({
        ...valid,
        discountCode: 'LAUNCH20',
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.orderTotal).toBe(299.98);
      expect(body.discountApplied).toBeNull();
    });

    it('does not track discount error for invalid code when control', async () => {
      const response = await post({
        ...valid,
        discountCode: 'INVALID',
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      // Control: invalid code is silently ignored
      expect(body.orderTotal).toBe(299.98);
      expect(track).not.toHaveBeenCalledWith(
        'enable-discount-codes-error',
        expect.anything(),
      );
    });

    it('works without discount code in control', async () => {
      const response = await post(valid);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.orderTotal).toBe(299.98);
      expect(body.discountApplied).toBeNull();
    });
  });

  describe('enable-discount-codes flag [TREATMENT PATH: v1]', () => {
    // When flag returns 'v1', discount code feature is ON
    beforeEach(() => {
      stringVariation.mockResolvedValue('v1');
    });

    it('applies valid discount code when flag is v1', async () => {
      const response = await post({
        ...valid,
        discountCode: 'SAVE10',
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      // 299.98 * 0.10 = 29.998 discount
      const expectedDiscount = 299.98 * 0.1;
      const expectedTotal = 299.98 - expectedDiscount;
      expect(body.orderTotal).toBeCloseTo(expectedTotal, 2);
      expect(body.subtotal).toBe(299.98);
      expect(body.discountApplied).toMatchObject({
        code: 'SAVE10',
      });
      expect(body.discountApplied?.amount).toBeCloseTo(expectedDiscount, 2);
      // Success tracking event fired
      expect(track).toHaveBeenCalledWith(
        'enable-discount-codes-success',
        'test-user-1234567890',
      );
      // Conversion tracked with discount metadata
      expect(track).toHaveBeenCalledWith(
        'checkout-completed',
        'test-user-1234567890',
        expect.any(Number),
        expect.objectContaining({
          discountCode: 'SAVE10',
          subtotal: 299.98,
        }),
      );
      // No error event
      expect(track).not.toHaveBeenCalledWith(
        'enable-discount-codes-error',
        expect.anything(),
      );
    });

    it('applies LAUNCH20 discount correctly', async () => {
      const response = await post({
        ...valid,
        discountCode: 'LAUNCH20',
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      const expectedDiscount = 299.98 * 0.20;
      const expectedTotal = 299.98 - expectedDiscount;
      expect(body.orderTotal).toBeCloseTo(expectedTotal, 2);
      expect(body.discountApplied?.code).toBe('LAUNCH20');
      expect(body.discountApplied?.amount).toBeCloseTo(expectedDiscount, 2);
      expect(track).toHaveBeenCalledWith(
        'enable-discount-codes-success',
        'test-user-1234567890',
      );
    });

    it('applies DEMO discount correctly', async () => {
      const response = await post({
        ...valid,
        discountCode: 'DEMO',
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      const expectedDiscount = 299.98 * 0.15;
      const expectedTotal = 299.98 - expectedDiscount;
      expect(body.orderTotal).toBeCloseTo(expectedTotal, 2);
      expect(body.discountApplied?.code).toBe('DEMO');
      expect(body.discountApplied?.amount).toBeCloseTo(expectedDiscount, 2);
    });

    it('is case-insensitive for discount codes', async () => {
      const response = await post({
        ...valid,
        discountCode: 'save10',
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.discountApplied?.code).toBe('SAVE10');
      expect(track).toHaveBeenCalledWith(
        'enable-discount-codes-success',
        'test-user-1234567890',
      );
    });

    it('rejects invalid discount code with 400 error', async () => {
      const response = await post({
        ...valid,
        discountCode: 'INVALID',
      });
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error).toContain('Invalid discount code');
      // Error tracking event fired
      expect(track).toHaveBeenCalledWith(
        'enable-discount-codes-error',
        'test-user-1234567890',
      );
      // No success event and no conversion event when code is invalid
      expect(track).not.toHaveBeenCalledWith(
        'enable-discount-codes-success',
        expect.anything(),
      );
      expect(track).not.toHaveBeenCalledWith(
        'checkout-completed',
        expect.anything(),
      );
    });

    it('does not apply discount when code is empty string', async () => {
      const response = await post({
        ...valid,
        discountCode: '',
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.orderTotal).toBe(299.98);
      expect(body.discountApplied).toBeNull();
      // No discount events when no code provided
      expect(track).not.toHaveBeenCalledWith(
        'enable-discount-codes-success',
        expect.anything(),
      );
      expect(track).not.toHaveBeenCalledWith(
        'enable-discount-codes-error',
        expect.anything(),
      );
    });

    it('does not apply discount when code is undefined', async () => {
      const response = await post(valid);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.orderTotal).toBe(299.98);
      expect(body.discountApplied).toBeNull();
    });

    it('tracks flag evaluation for every checkout', async () => {
      await post(valid);
      expect(stringVariation).toHaveBeenCalledWith(
        'enable-discount-codes',
        'test-user-1234567890',
        'control',
      );
    });
  });
});
