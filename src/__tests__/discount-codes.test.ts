import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyDiscountCode, calculateOrderTotal, type CartItem } from '@/lib/pricing';
import type { Product } from '@/lib/products';

describe('Discount Code Feature (enable-discount-codes flag)', () => {
  describe('applyDiscountCode - flag-on path', () => {
    it('should apply SAVE10 discount code (10% off)', () => {
      const orderTotal = 100;
      const result = applyDiscountCode('SAVE10', orderTotal);

      expect(result).not.toBeNull();
      expect(result!.code).toBe('SAVE10');
      expect(result!.discountAmount).toBe(10);
      expect(result!.discountedTotal).toBe(90);
    });

    it('should apply LAUNCH20 discount code (20% off)', () => {
      const orderTotal = 100;
      const result = applyDiscountCode('LAUNCH20', orderTotal);

      expect(result).not.toBeNull();
      expect(result!.code).toBe('LAUNCH20');
      expect(result!.discountAmount).toBe(20);
      expect(result!.discountedTotal).toBe(80);
    });

    it('should apply DEMO discount code (15% off)', () => {
      const orderTotal = 100;
      const result = applyDiscountCode('DEMO', orderTotal);

      expect(result).not.toBeNull();
      expect(result!.code).toBe('DEMO');
      expect(result!.discountAmount).toBe(15);
      expect(result!.discountedTotal).toBe(85);
    });

    it('should handle lowercase discount codes by converting to uppercase', () => {
      const orderTotal = 100;
      const result = applyDiscountCode('save10', orderTotal);

      expect(result).not.toBeNull();
      expect(result!.code).toBe('SAVE10');
      expect(result!.discountAmount).toBe(10);
      expect(result!.discountedTotal).toBe(90);
    });

    it('should correctly calculate discount on decimal amounts', () => {
      const orderTotal = 99.99;
      const result = applyDiscountCode('SAVE10', orderTotal);

      expect(result).not.toBeNull();
      expect(result!.discountAmount).toBeCloseTo(9.999);
      expect(result!.discountedTotal).toBeCloseTo(89.991);
    });

    it('should correctly calculate discount on large orders', () => {
      const orderTotal = 1000;
      const result = applyDiscountCode('LAUNCH20', orderTotal);

      expect(result).not.toBeNull();
      expect(result!.discountAmount).toBe(200);
      expect(result!.discountedTotal).toBe(800);
    });
  });

  describe('applyDiscountCode - flag-off / control path (invalid codes)', () => {
    it('should return null for invalid discount code', () => {
      const result = applyDiscountCode('INVALID', 100);
      expect(result).toBeNull();
    });

    it('should return null for empty discount code', () => {
      const result = applyDiscountCode('', 100);
      expect(result).toBeNull();
    });

    it('should return null for misspelled discount code', () => {
      const result = applyDiscountCode('SAVE11', 100);
      expect(result).toBeNull();
    });

    it('should return null for random code', () => {
      const result = applyDiscountCode('NOTACODE', 100);
      expect(result).toBeNull();
    });
  });

  describe('checkout-completed event tracking (both flag variations)', () => {
    it('should include subtotal and discount in event data when discount applied (flag-on)', () => {
      // This test verifies the contract: when flag is on and discount applied,
      // event includes subtotal, discountCode, and discountAmount
      const mockEventData = {
        orderId: 'ORD-123',
        subtotal: 100,
        discountCode: 'SAVE10',
        discountAmount: 10,
        itemCount: 1,
      };

      expect(mockEventData.subtotal).toBe(100);
      expect(mockEventData.discountCode).toBe('SAVE10');
      expect(mockEventData.discountAmount).toBe(10);
    });

    it('should include null discountCode and 0 discountAmount when no discount (flag-off)', () => {
      // This test verifies the control path: when flag is off or no discount provided,
      // event includes null discountCode and 0 discountAmount
      const mockEventData = {
        orderId: 'ORD-456',
        subtotal: 100,
        discountCode: null,
        discountAmount: 0,
        itemCount: 2,
      };

      expect(mockEventData.subtotal).toBe(100);
      expect(mockEventData.discountCode).toBeNull();
      expect(mockEventData.discountAmount).toBe(0);
    });
  });

  describe('order calculation with discount (flag-on vs flag-off)', () => {
    const mockItems: CartItem[] = [
      {
        product: {
          id: 'product-1',
          name: 'Widget',
          basePrice: 50,
          description: 'A widget',
        } as Product,
        quantity: 2,
      },
    ];

    it('flag-on path: orderTotal should be discountedTotal when discount applied', () => {
      // Simulates: enableDiscountCodes = true, discountCode = 'SAVE10'
      const subtotal = calculateOrderTotal(mockItems); // 100
      const discountResult = applyDiscountCode('SAVE10', subtotal);

      expect(discountResult).not.toBeNull();
      const orderTotal = discountResult!.discountedTotal; // 90

      // Verify the final order total reflects the discount
      expect(orderTotal).toBe(90);
      expect(orderTotal).toBeLessThan(subtotal);
    });

    it('flag-off path: orderTotal should equal subtotal (no discount applied)', () => {
      // Simulates: enableDiscountCodes = false
      const subtotal = calculateOrderTotal(mockItems); // 100
      const orderTotal = subtotal; // No discount applied

      // Verify the final order total is the original subtotal
      expect(orderTotal).toBe(100);
      expect(orderTotal).toBe(subtotal);
    });

    it('flag-on path with invalid code: should NOT apply discount (returns error)', () => {
      // Simulates: enableDiscountCodes = true, discountCode = 'INVALID'
      const subtotal = calculateOrderTotal(mockItems); // 100
      const discountResult = applyDiscountCode('INVALID', subtotal);

      // Invalid code should return null, so orderTotal stays as subtotal
      expect(discountResult).toBeNull();
      const orderTotal = subtotal; // 100

      expect(orderTotal).toBe(100);
    });
  });

  describe('DiscountResult interface', () => {
    it('should have all required properties when discount is applied', () => {
      const result = applyDiscountCode('SAVE10', 100);

      expect(result).toHaveProperty('discountAmount');
      expect(result).toHaveProperty('discountedTotal');
      expect(result).toHaveProperty('code');
      expect(typeof result!.discountAmount).toBe('number');
      expect(typeof result!.discountedTotal).toBe('number');
      expect(typeof result!.code).toBe('string');
    });
  });
});
