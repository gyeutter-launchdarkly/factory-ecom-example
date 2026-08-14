import type { Product } from './products';
import { boolVariation, track } from './ld';

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
  const startTime = Date.now();
  try {
    const enableDynamicPricing = await boolVariation('enable-dynamic-pricing', 'anonymous', false);
    
    let price: number;
    if (enableDynamicPricing) {
      // v1: apply demand-based multiplier
      price = product.basePrice * getDemandMultiplier(product);
    } else {
      // control: return basePrice only
      price = product.basePrice;
    }
    
    // Track latency (guarded-release metric)
    const elapsedMs = Date.now() - startTime;
    await track('enable-dynamic-pricing-latency', 'anonymous', elapsedMs).catch(() => {
      // Silently ignore tracking errors — never let telemetry break the request
    });
    
    return price;
  } catch (error) {
    // Track pricing errors (guarded-release metric)
    await track('enable-dynamic-pricing-error', 'anonymous').catch(() => {
      // Silently ignore tracking errors — never let telemetry break the request
    });
    throw error;
  }
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
