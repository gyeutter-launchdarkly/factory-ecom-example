import { NextResponse } from 'next/server';
import { CAT_PRODUCTS, PRODUCTS } from '@/lib/products';
import { boolVariation, stringVariation } from '@/lib/ld';
import { calculatePrice, formatPrice } from '@/lib/pricing';
import { demoProfile } from '@/lib/demo-profile';

// Both of this route's inputs change while the server is running: the flag
// variations come from LaunchDarkly and the storefront from the TUI's settings
// file. Next caches a GET handler that uses no request data, which froze this
// response at whatever the first caller saw — a flag flip, and a storefront
// switch, then changed nothing on the page.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const profile = await demoProfile();
  // Feature flag: show-product-reviews (boolean)
  // Controls whether review counts appear on product cards. Boolean flags are
  // read with boolVariation and used directly as a condition.
  const showProductReviews = await boolVariation('show-product-reviews', 'anonymous', false);

  // Feature flag: catalog-sort-order (multivariate: 'control' | 'v1')
  // This is the pattern to follow for a new flag: AutoFactory creates
  // multivariate flags, so the variation is fetched as a string and compared by
  // name. Reading one through a boolean helper would make the control path
  // unreachable — every non-empty string is truthy — and the deterministic
  // [variation-wired-in-code] check rejects exactly that shape.
  const sortOrder = await stringVariation('catalog-sort-order', 'anonymous', 'control');

  const catalog = profile === 'cat' ? CAT_PRODUCTS : PRODUCTS;
  const products = catalog.map((p) => ({
    ...p,
    displayPrice: formatPrice(calculatePrice(p)),
  }));

  if (sortOrder === 'v1') {
    products.sort((a, b) => calculatePrice(a) - calculatePrice(b));
  }

  return NextResponse.json({
    profile,
    products,
    flags: { showProductReviews, catalogSortOrder: sortOrder },
  });
}
