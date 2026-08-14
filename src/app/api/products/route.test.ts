import { beforeEach, describe, expect, it, vi } from 'vitest';

// The pattern the AutoFactory Flag Testing agent should follow: mock the flag
// evaluation, then assert BOTH variations. `@/lib/ld` is the single place flags
// are read, so mocking it covers any flag the factory wires.
const boolVariation = vi.fn();
vi.mock('@/lib/ld', () => ({
  boolVariation: (...args: unknown[]) => boolVariation(...args),
  stringVariation: vi.fn(),
  track: vi.fn(),
}));

// vi.mock is hoisted above imports, so a static import still receives the mock.
import { GET } from '@/app/api/products/route';


describe('GET /api/products', () => {
  beforeEach(() => boolVariation.mockReset());

  it('hides reviews when the flag is off (control path)', async () => {
    boolVariation.mockResolvedValue(false);
    const body = await (await GET()).json();
    expect(body.flags.showProductReviews).toBe(false);
    expect(body.products.length).toBeGreaterThan(0);
  });

  it('shows reviews when the flag is on', async () => {
    boolVariation.mockResolvedValue(true);
    const body = await (await GET()).json();
    expect(body.flags.showProductReviews).toBe(true);
  });

  it('still returns a priced catalogue either way', async () => {
    boolVariation.mockResolvedValue(false);
    const body = await (await GET()).json();
    for (const p of body.products) expect(p.displayPrice).toMatch(/^\$\d/);
  });
});
