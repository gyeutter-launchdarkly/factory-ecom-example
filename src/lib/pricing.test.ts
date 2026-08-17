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

  describe('applyDiscountCode (flag: enable-discount-codes v1 path)', () => {
    it('applies SAVE10 discount code correctly', () => {
      const result = applyDiscountCode('SAVE10', 100);
      expect(result).toEqual({
        code: 'SAVE10',
        discountAmount: 10,
        discountedTotal: 90,
      });
    });

    it('applies LAUNCH20 discount code correctly', () => {
      const result = applyDiscountCode('LAUNCH20', 100);
      expect(result).toEqual({
        code: 'LAUNCH20',
        discountAmount: 20,
        discountedTotal: 80,
      });
    });

    it('applies DEMO discount code correctly', () => {
      const result = applyDiscountCode('DEMO', 100);
      expect(result).toEqual({
        code: 'DEMO',
        discountAmount: 15,
        discountedTotal: 85,
      });
    });

    it('returns null for invalid discount code', () => {
      const result = applyDiscountCode('INVALID', 100);
      expect(result).toBeNull();
    });

    it('handles case-insensitive discount codes', () => {
      const result = applyDiscountCode('save10', 100);
      expect(result).toEqual({
        code: 'SAVE10',
        discountAmount: 10,
        discountedTotal: 90,
      });
    });

    it('handles mixed case discount codes', () => {
      const result = applyDiscountCode('Launch20', 100);
      expect(result).toEqual({
        code: 'LAUNCH20',
        discountAmount: 20,
        discountedTotal: 80,
      });
    });

    it('calculates discounts correctly on various order totals', () => {
      const testCases = [
        { code: 'SAVE10', total: 50, expectedDiscount: 5, expectedFinal: 45 },
        { code: 'SAVE10', total: 199.99, expectedDiscount: 19.999, expectedFinal: 179.99 },
        { code: 'LAUNCH20', total: 250, expectedDiscount: 50, expectedFinal: 200 },
        { code: 'DEMO', total: 333.33, expectedDiscount: 49.9995, expectedFinal: 283.3305 },
      ];

      for (const testCase of testCases) {
        const result = applyDiscountCode(testCase.code, testCase.total);
        expect(result).not.toBeNull();
        expect(result!.discountAmount).toBeCloseTo(testCase.expectedDiscount, 2);
        expect(result!.discountedTotal).toBeCloseTo(testCase.expectedFinal, 2);
      }
    });

    it('returns uppercase code regardless of input case', () => {
      const cases = ['SAVE10', 'save10', 'Save10', 'sAvE10'];
      for (const code of cases) {
        const result = applyDiscountCode(code, 100);
        expect(result?.code).toBe('SAVE10');
      }
    });

    it('rejects codes with extra whitespace', () => {
      const result = applyDiscountCode(' SAVE10 ', 100);
      expect(result).toBeNull();
    });

    it('rejects partially matching codes', () => {
      const result = applyDiscountCode('SAVE1', 100);
      expect(result).toBeNull();
    });

    it('rejects empty string code', () => {
      const result = applyDiscountCode('', 100);
      expect(result).toBeNull();
    });

    it('discounts apply correctly to zero order total', () => {
      const result = applyDiscountCode('SAVE10', 0);
      expect(result).toEqual({
        code: 'SAVE10',
        discountAmount: 0,
        discountedTotal: 0,
      });
    });

    it('discounts apply correctly to large order totals', () => {
      const result = applyDiscountCode('LAUNCH20', 10000);
      expect(result).toEqual({
        code: 'LAUNCH20',
        discountAmount: 2000,
        discountedTotal: 8000,
      });
    });

    it('returned total equals original minus discount amount', () => {
      const testCodes = ['SAVE10', 'LAUNCH20', 'DEMO'];
      const testTotal = 500;

      for (const code of testCodes) {
        const result = applyDiscountCode(code, testTotal);
        expect(result).not.toBeNull();
        expect(result!.discountedTotal).toBe(testTotal - result!.discountAmount);
      }
    });
  });
});
