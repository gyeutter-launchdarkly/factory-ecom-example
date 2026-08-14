import { describe, expect, it } from 'vitest';
import { calculatePrice, formatPrice, applyDiscountCode } from '@/lib/pricing';
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

describe('applyDiscountCode — discount codes feature flag', () => {
  describe('Valid discount codes', () => {
    it('applies SAVE10 discount (10% off)', () => {
      const result = applyDiscountCode('SAVE10', 100);
      expect(result).toEqual({
        code: 'SAVE10',
        discountAmount: 10,
        discountedTotal: 90,
      });
    });

    it('applies LAUNCH20 discount (20% off)', () => {
      const result = applyDiscountCode('LAUNCH20', 100);
      expect(result).toEqual({
        code: 'LAUNCH20',
        discountAmount: 20,
        discountedTotal: 80,
      });
    });

    it('applies DEMO discount (15% off)', () => {
      const result = applyDiscountCode('DEMO', 100);
      expect(result).toEqual({
        code: 'DEMO',
        discountAmount: 15,
        discountedTotal: 85,
      });
    });

    it('is case-insensitive', () => {
      const result = applyDiscountCode('save10', 100);
      expect(result).toEqual({
        code: 'SAVE10',
        discountAmount: 10,
        discountedTotal: 90,
      });
    });

    it('correctly calculates discount on various order totals', () => {
      const result = applyDiscountCode('LAUNCH20', 250);
      expect(result?.discountAmount).toBe(50); // 20% of 250
      expect(result?.discountedTotal).toBe(200);
    });

    it('handles fractional discount amounts', () => {
      const result = applyDiscountCode('SAVE10', 33.33);
      expect(result?.discountAmount).toBeCloseTo(3.333, 2);
      expect(result?.discountedTotal).toBeCloseTo(30.0, 1);
    });
  });

  describe('Invalid discount codes', () => {
    it('returns null for unknown code', () => {
      const result = applyDiscountCode('UNKNOWN', 100);
      expect(result).toBeNull();
    });

    it('returns null for typo in code', () => {
      const result = applyDiscountCode('SAVE15', 100);
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = applyDiscountCode('', 100);
      expect(result).toBeNull();
    });

    it('returns null for whitespace-only code', () => {
      const result = applyDiscountCode('   ', 100);
      expect(result).toBeNull();
    });
  });
});
