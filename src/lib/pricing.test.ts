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

  describe('applyDiscountCode [PART OF enable-discount-codes FLAG]', () => {
    it('applies SAVE10 (10%) discount correctly', () => {
      const result = applyDiscountCode('SAVE10', 100);
      expect(result).not.toBeNull();
      expect(result?.discountAmount).toBe(10);
      expect(result?.discountedTotal).toBe(90);
      expect(result?.code).toBe('SAVE10');
    });

    it('applies LAUNCH20 (20%) discount correctly', () => {
      const result = applyDiscountCode('LAUNCH20', 100);
      expect(result).not.toBeNull();
      expect(result?.discountAmount).toBe(20);
      expect(result?.discountedTotal).toBe(80);
      expect(result?.code).toBe('LAUNCH20');
    });

    it('applies DEMO (15%) discount correctly', () => {
      const result = applyDiscountCode('DEMO', 100);
      expect(result).not.toBeNull();
      expect(result?.discountAmount).toBe(15);
      expect(result?.discountedTotal).toBe(85);
      expect(result?.code).toBe('DEMO');
    });

    it('is case-insensitive for discount code input', () => {
      const resultLower = applyDiscountCode('save10', 100);
      const resultUpper = applyDiscountCode('SAVE10', 100);
      expect(resultLower?.code).toBe('SAVE10');
      expect(resultLower?.discountAmount).toBe(resultUpper?.discountAmount);
    });

    it('normalizes code to uppercase in result', () => {
      const result = applyDiscountCode('SaVe10', 100);
      expect(result?.code).toBe('SAVE10');
    });

    it('returns null for invalid discount code', () => {
      const result = applyDiscountCode('INVALID', 100);
      expect(result).toBeNull();
    });

    it('returns null for empty code', () => {
      const result = applyDiscountCode('', 100);
      expect(result).toBeNull();
    });

    it('returns null for unknown code', () => {
      const result = applyDiscountCode('NOTAREALCODE', 100);
      expect(result).toBeNull();
    });

    it('correctly calculates discount on decimal amounts', () => {
      const result = applyDiscountCode('SAVE10', 299.98);
      expect(result).not.toBeNull();
      expect(result?.discountAmount).toBeCloseTo(29.998, 2);
      expect(result?.discountedTotal).toBeCloseTo(269.982, 2);
    });

    it('works with zero order total', () => {
      const result = applyDiscountCode('SAVE10', 0);
      expect(result).not.toBeNull();
      expect(result?.discountAmount).toBe(0);
      expect(result?.discountedTotal).toBe(0);
    });

    it('works with large order totals', () => {
      const result = applyDiscountCode('LAUNCH20', 10000);
      expect(result).not.toBeNull();
      expect(result?.discountAmount).toBe(2000);
      expect(result?.discountedTotal).toBe(8000);
    });
  });
});
