import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/ld', () => ({ track }));
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
beforeEach(() => track.mockReset().mockResolvedValue(undefined));
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
});
