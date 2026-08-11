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

export function calculateLineTotal(item: CartItem): number {
  return calculatePrice(item.product) * item.quantity;
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
