import type { Product } from './products';
import { boolVariation } from './ld';

export interface CartItem {
  product: Product;
  quantity: number;
}

// Demand multiplier based on current inventory level.
// Low inventory signals high demand, so price adjusts upward to manage supply.
// Control path: not applied (flag off, multiplier always 1.0)
// v1 path: applied to calculatePrice when flag is on
export function getDemandMultiplier(product: Product): number {
  if (product.inventory < 20) return 1.15;  // scarce  -> +15%
  if (product.inventory < 40) return 1.08;  // limited -> +8%
  return 1.0;                                // normal  -> no change
}

// Calculate the unit price for a product.
// Gated by enable-dynamic-pricing flag:
// - control (flag off): returns basePrice only
// - v1 (flag on): returns basePrice * demand multiplier
export async function calculatePrice(product: Product): number {
  const enableDynamicPricing = await boolVariation('enable-dynamic-pricing', 'anonymous', false);
  
  if (enableDynamicPricing) {
    // v1: apply demand-based multiplier
    return product.basePrice * getDemandMultiplier(product);
  }
  
  // control: return basePrice only
  return product.basePrice;
}

export async function calculateLineTotal(item: CartItem): Promise<number> {
  const price = await calculatePrice(item.product);
  return price * item.quantity;
}

export async function calculateOrderTotal(items: CartItem[]): Promise<number> {
  let total = 0;
  for (const item of items) {
    total += await calculateLineTotal(item);
  }
  return total;
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
