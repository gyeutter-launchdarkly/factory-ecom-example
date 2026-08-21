import { NextResponse } from 'next/server';
import { activeCatalog } from '@/lib/catalog';
import { boolVariation, stringVariation } from '@/lib/ld';
import { calculatePrice, formatPrice } from '@/lib/pricing';

// Flag variations and the selected demo pack both change while the server is
// running. Next caches a GET handler that uses no request data, which would
// otherwise freeze this response at whatever the first caller saw — a flag flip
// or a pack switch would then change nothing on the page.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET() {
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

  const { packId, products: catalog } = await activeCatalog();

  const products = catalog.map((p) => ({
    ...p,
    displayPrice: formatPrice(calculatePrice(p)),
  }));

  if (sortOrder === 'v1') {
    products.sort((a, b) => calculatePrice(a) - calculatePrice(b));
  }

  return NextResponse.json({
    // Which store these products belong to: the page waits for the catalog and
    // the branding to agree, so a switch cannot leave one store's products
    // under another store's header.
    pack: packId,
    products,
    flags: { showProductReviews, catalogSortOrder: sortOrder },
  });
}
