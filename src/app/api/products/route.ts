import { NextResponse } from 'next/server';
import { PRODUCTS } from '@/lib/products';
import { boolVariation, stringVariation } from '@/lib/ld';
import { calculatePrice, formatPrice } from '@/lib/pricing';

export async function GET() {
  // Feature flag: show-product-reviews
  // Controls whether review counts appear on product cards.
  // This is the repo's existing flag evaluation pattern — AutoFactory agents
  // discover it via grep and follow it when implementing new flags.
  const showProductReviews = await boolVariation('show-product-reviews', 'anonymous', false);

  // Feature flag: enable-express-checkout
  // Gates the Buy Now button, /express-checkout page, and /api/express-checkout.
  // Variation 'v1' = express checkout enabled; 'control' = hidden (existing behavior).
  const expressCheckoutVariation = await stringVariation('enable-express-checkout', 'anonymous', 'control');
  const enableExpressCheckout = expressCheckoutVariation === 'v1';

  const products = PRODUCTS.map((p) => ({
    ...p,
    displayPrice: formatPrice(calculatePrice(p)),
  }));

  return NextResponse.json({ products, flags: { showProductReviews, enableExpressCheckout } });
}
