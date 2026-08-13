'use client';

import { useRouter } from 'next/navigation';
import { useCart } from './CartProvider';

interface ProductCardProps {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  displayPrice: string;
  price: number;
  showReviews?: boolean;
  showBuyNow?: boolean;
}

// Static review data — only visible when the show-product-reviews flag is on.
// The feature/product-ratings branch adds real per-product rating fields.
const MOCK_REVIEWS: Record<string, { rating: number; count: number }> = {
  'prod-001': { rating: 4.7, count: 284 },
  'prod-002': { rating: 4.5, count: 193 },
  'prod-003': { rating: 4.8, count: 421 },
  'prod-004': { rating: 4.3, count: 97 },
  'prod-005': { rating: 4.6, count: 152 },
  'prod-006': { rating: 4.9, count: 68 },
};

export function ProductCard({
  id,
  name,
  description,
  category,
  emoji,
  displayPrice,
  price,
  showReviews,
  showBuyNow,
}: ProductCardProps) {
  const { add } = useCart();
  const router = useRouter();
  const reviews = MOCK_REVIEWS[id];

  const handleAdd = () => add({ productId: id, name, emoji, price, displayPrice });

  // Express checkout: skip the cart and go straight to a single-item checkout.
  // The factory will gate this behind a feature flag so it can be rolled out
  // progressively and monitored against checkout-completed rate.
  const handleBuyNow = () => {
    const params = new URLSearchParams({
      productId: id,
      name,
      emoji,
      displayPrice,
      price: String(price),
    });
    router.push(`/express-checkout?${params}`);
  };

  return (
    <div className="group flex flex-col">
      {/* Product bed: soft shell that warms to blush on hover. */}
      <div className="relative rounded-3xl bg-shell group-hover:bg-blush transition-colors duration-300 aspect-[4/3] flex items-center justify-center overflow-hidden">
        <span className="text-6xl select-none transition-transform duration-300 group-hover:scale-[1.06]">
          {emoji}
        </span>

        {/* Add button reveals on hover, sits on the image like most modern stores. */}
        <button
          onClick={handleAdd}
          className="absolute bottom-3 left-3 right-3 bg-ink text-cream text-[12px] font-medium py-2.5 rounded-pill opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 hover:bg-rose hover:text-ink"
        >
          Add to bag
        </button>
      </div>

      <div className="pt-4 flex flex-col gap-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{category}</p>
        <h3 className="text-[15px] font-medium leading-snug">{name}</h3>
        <p className="text-[13px] text-muted leading-relaxed line-clamp-2">{description}</p>

        {/* Controlled by the show-product-reviews feature flag */}
        {showReviews && reviews && (
          <p className="text-[12px] text-muted mt-0.5">
            <span className="text-rose">
              {'★'.repeat(Math.round(reviews.rating))}
              {'☆'.repeat(5 - Math.round(reviews.rating))}
            </span>{' '}
            {reviews.rating} ({reviews.count})
          </p>
        )}

        <p className="text-[15px] mt-1.5">{displayPrice}</p>

        {/* Express checkout: skips the cart and goes straight to a one-item
            checkout. Gated behind enable-express-checkout flag (v1).
            When flag is off (control), the button is hidden — existing behavior. */}
        {showBuyNow && (
          <button
            onClick={handleBuyNow}
            className="mt-2.5 w-full border border-ink text-ink text-[13px] font-medium py-2.5 rounded-pill hover:bg-ink hover:text-cream transition-colors"
          >
            Buy now
          </button>
        )}
      </div>
    </div>
  );
}
