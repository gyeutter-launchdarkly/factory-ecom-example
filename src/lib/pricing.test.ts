import { describe, expect, it } from 'vitest';
import { calculatePrice, formatPrice } from '@/lib/pricing';
import { PRODUCTS } from '@/lib/products';

// A small suite that exists mainly so the repo has a working test command and a
// pattern for the factory's Flag Testing agent to follow.
describe('pricing', () => {
  it('formats prices as USD', () => {
    expect(formatPrice(149.99)).toBe('$149.99');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('prices every product at or above its base price', () => {
    for (const product of PRODUCTS) {
      expect(calculatePrice(product)).toBeGreaterThanOrEqual(product.basePrice);
    }
  });
});
