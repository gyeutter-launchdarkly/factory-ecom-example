import type { Product } from './products';

export interface CartItem {
  product: Product;
  quantity: number;
}

// Demand multiplier based on current inventory level.
// Low inventory signals high demand, so price adjusts upward to manage supply.
export function getDemandMultiplier(product: Product): number {
  if (product.inventory < 20) return 1.15;  // scarce  -> +15%
  if (product.inventory < 40) return 1.08;  // limited -> +8%
  return 1.0;                                // normal  -> no change
}

// Calculate the unit price for a product, adjusted for demand.
// Multiplier is derived from current inventory: lower stock = higher price.
export function calculatePrice(product: Product): number {
  return product.basePrice * getDemandMultiplier(product);
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
