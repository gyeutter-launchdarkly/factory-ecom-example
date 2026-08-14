import { describe, expect, it, vi, beforeEach } from 'vitest';
import { calculatePrice, formatPrice, getDemandMultiplier } from '@/lib/pricing';
import { PRODUCTS } from '@/lib/products';

// Mock the LaunchDarkly client
vi.mock('./ld', () => ({
  boolVariation: vi.fn(),
  stringVariation: vi.fn(),
  track: vi.fn().mockResolvedValue(undefined),
}));

const { boolVariation, track } = await import('./ld');

// A small suite that exists mainly so the repo has a working test command and a
// pattern for the factory's Flag Testing agent to follow.
describe('pricing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Ensure track() returns a resolved Promise
    vi.mocked(track).mockResolvedValue(undefined);
  });

  it('formats prices as USD', () => {
    expect(formatPrice(149.99)).toBe('$149.99');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('prices every product at or above its base price (with flag off by default)', async () => {
    // Flag off (default) → control path → basePrice only
    vi.mocked(boolVariation).mockResolvedValue(false);
    for (const product of PRODUCTS) {
      const price = await calculatePrice(product);
      expect(price).toBe(product.basePrice);
    }
  });

  it('applies demand multiplier when enable-dynamic-pricing flag is on', async () => {
    // Flag on → v1 path → basePrice * multiplier
    vi.mocked(boolVariation).mockResolvedValue(true);
    for (const product of PRODUCTS) {
      const price = await calculatePrice(product);
      const multiplier = getDemandMultiplier(product);
      expect(price).toBe(product.basePrice * multiplier);
      expect(price).toBeGreaterThanOrEqual(product.basePrice);
    }
  });

  it('getDemandMultiplier returns correct values for inventory levels', () => {
    expect(getDemandMultiplier({ id: '1', name: 'Test', basePrice: 100, inventory: 19 })).toBe(1.15);
    expect(getDemandMultiplier({ id: '1', name: 'Test', basePrice: 100, inventory: 20 })).toBe(1.08);
    expect(getDemandMultiplier({ id: '1', name: 'Test', basePrice: 100, inventory: 39 })).toBe(1.08);
    expect(getDemandMultiplier({ id: '1', name: 'Test', basePrice: 100, inventory: 40 })).toBe(1.0);
    expect(getDemandMultiplier({ id: '1', name: 'Test', basePrice: 100, inventory: 100 })).toBe(1.0);
  });

  it('emits latency telemetry when flag is off (control path)', async () => {
    // Control path: flag off → track latency event
    vi.mocked(boolVariation).mockResolvedValue(false);
    const product = PRODUCTS[0];
    await calculatePrice(product);
    
    expect(vi.mocked(track)).toHaveBeenCalledWith(
      'enable-dynamic-pricing-latency',
      'anonymous',
      expect.any(Number)
    );
    // Verify the latency value is reasonable (>= 0ms, typically < 100ms for sync operations)
    const callArgs = vi.mocked(track).mock.calls[0];
    expect(callArgs[2]).toBeGreaterThanOrEqual(0);
  });

  it('emits latency telemetry when flag is on (v1 path)', async () => {
    // v1 path: flag on → track latency event (should still emit)
    vi.mocked(boolVariation).mockResolvedValue(true);
    const product = PRODUCTS[0];
    await calculatePrice(product);
    
    expect(vi.mocked(track)).toHaveBeenCalledWith(
      'enable-dynamic-pricing-latency',
      'anonymous',
      expect.any(Number)
    );
    const callArgs = vi.mocked(track).mock.calls[0];
    expect(callArgs[2]).toBeGreaterThanOrEqual(0);
  });

  it('emits error telemetry when calculatePrice throws', async () => {
    // Simulate a flag evaluation error by making boolVariation throw
    vi.mocked(boolVariation).mockRejectedValueOnce(new Error('Flag eval failed'));
    const product = PRODUCTS[0];
    
    try {
      await calculatePrice(product);
      expect.fail('Should have thrown');
    } catch (e) {
      // Expected to throw
    }
    
    expect(vi.mocked(track)).toHaveBeenCalledWith(
      'enable-dynamic-pricing-error',
      'anonymous'
    );
  });

  it('does not break request if telemetry tracking fails', async () => {
    // Telemetry errors should not propagate (wrapped in .catch())
    vi.mocked(boolVariation).mockResolvedValue(false);
    vi.mocked(track).mockRejectedValueOnce(new Error('Telemetry service down'));
    
    const product = PRODUCTS[0];
    const price = await calculatePrice(product);
    
    // Should still return the correct price despite tracking failure
    expect(price).toBe(product.basePrice);
  });

  it('correctly evaluates enable-dynamic-pricing flag with user context', async () => {
    // Ensure boolVariation is called with the correct flag key, context, and default
    vi.mocked(boolVariation).mockResolvedValue(false);
    const product = PRODUCTS[0];
    await calculatePrice(product);
    
    expect(vi.mocked(boolVariation)).toHaveBeenCalledWith(
      'enable-dynamic-pricing',
      'anonymous',
      false
    );
  });
});
