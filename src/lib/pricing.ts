import type { Product } from './products';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface DiscountResult {
  discountAmount: number;
  discountedTotal: number;
  code: string;
}

// Valid discount codes and their percentage off
const DISCOUNT_CODES: Record<string, number> = {
  SAVE10: 0.10,
  LAUNCH20: 0.20,
  DEMO: 0.15,
};

// Calculate the unit price for a product.
// This is the primary target for the feature/dynamic-pricing branch —
// that change adds a demand-based multiplier here.
export function calculatePrice(product: Product): number {
  return product.basePrice;
}

export function calculateLineTotal(item: CartItem): number {
  return calculatePrice(item.product) * item.quantity;
}

export function calculateOrderTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
}

// Apply a discount code to an order total.
// Returns the discount amount and final total, or null if the code is invalid.
export function applyDiscountCode(
  code: string,
  orderTotal: number,
): DiscountResult | null {
  const pct = DISCOUNT_CODES[code.toUpperCase()];
  if (pct === undefined) return null;
  const discountAmount = orderTotal * pct;
  return {
    discountAmount,
    discountedTotal: orderTotal - discountAmount,
    code: code.toUpperCase(),
  };
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
