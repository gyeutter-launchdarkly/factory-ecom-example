import { NextResponse } from 'next/server';
import { PRODUCTS } from '@/lib/products';
import { boolVariation } from '@/lib/ld';
import { calculatePrice, formatPrice } from '@/lib/pricing';

export async function GET() {
  // Feature flag: show-product-reviews
  // Controls whether review counts appear on product cards.
  // This is the repo's existing flag evaluation pattern — AutoFactory agents
  // discover it via grep and follow it when implementing new flags.
  const showProductReviews = await boolVariation('show-product-reviews', 'anonymous', false);

  const products = PRODUCTS.map((p) => ({
    ...p,
    displayPrice: formatPrice(calculatePrice(p)),
  }));

  return NextResponse.json({ products, flags: { showProductReviews } });
}
