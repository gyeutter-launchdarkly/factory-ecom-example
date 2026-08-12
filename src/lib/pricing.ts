import type { Product } from './products';

export interface CartItem {
  product: Product;
  quantity: number;
}

// Calculate the unit price for a product.
// This is the primary target for the feature/dynamic-pricing branch —
// that change adds a demand-based multiplier here.
export function calculatePrice(product: Product): number {
  return product.basePrice;
}

// Returns the bulk discount rate for a given quantity.
// Tiered discounts incentivise larger orders:
//   3–4 items → 10 %  off
//   5+  items → 15 %  off
export function getTieredDiscount(quantity: number): number {
  if (quantity >= 5) return 0.15;
  if (quantity >= 3) return 0.10;
  return 0;
}

export function calculateLineTotal(item: CartItem): number {
  const unit = calculatePrice(item.product);
  const discount = getTieredDiscount(item.quantity);
  return unit * item.quantity * (1 - discount);
}

export function calculateOrderTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
