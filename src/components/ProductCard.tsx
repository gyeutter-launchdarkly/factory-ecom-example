'use client';

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
  rating?: number;
  reviewCount?: number;
}

// Half-star aware rating display, fed by the real per-product fields this
// branch adds to products.ts.
function StarRating({ rating, count }: { rating: number; count: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <p className="text-[12px] text-muted mt-0.5">
      <span className="text-rose">
        {'★'.repeat(full)}
        {half ? '⯨' : ''}
        {'☆'.repeat(empty)}
      </span>{' '}
      {rating.toFixed(1)} ({count.toLocaleString()})
    </p>
  );
}

export function ProductCard({
  id,
  name,
  description,
  category,
  emoji,
  displayPrice,
  price,
  showReviews,
  rating,
  reviewCount,
}: ProductCardProps) {
  const { add } = useCart();

  const handleAdd = () => add({ productId: id, name, emoji, price, displayPrice });

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
        {showReviews && rating !== undefined && reviewCount !== undefined && (
          <StarRating rating={rating} count={reviewCount} />
        )}

        <p className="text-[15px] mt-1.5">{displayPrice}</p>
      </div>
    </div>
  );
}
