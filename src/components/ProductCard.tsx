'use client';

import { useState } from 'react';
import { useCart } from './CartProvider';

interface ProductCardProps {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  image?: string;
  displayPrice: string;
  price: number;
  showReviews?: boolean;
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
  image,
  displayPrice,
  price,
  showReviews,
}: ProductCardProps) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const reviews = MOCK_REVIEWS[id];

  const handleAdd = () => {
    add({ productId: id, name, emoji, image, price, displayPrice });
    setAdded(true);
  };

  return (
    <div className="group flex flex-col">
      {/* Generated catalog photography; packs can supply their own image. */}
      <div className="relative rounded-3xl bg-shell group-hover:bg-blush transition-colors duration-300 aspect-[4/3] flex items-center justify-center overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={name}
            width={1000}
            height={750}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="text-6xl select-none">{emoji}</span>
        )}

        {/* Visible for touch, pointer, and keyboard users. */}
        <button
          onClick={handleAdd}
          aria-label={`Add ${name} to bag`}
          className="absolute bottom-3 left-3 right-3 bg-ink text-cream text-[12px] font-medium py-2.5 rounded-pill opacity-100 transition-all duration-200 hover:bg-rose hover:text-ink"
        >
          {added ? 'Added · add another' : 'Add to bag'}
        </button>
      </div>

      <div className="pt-4 flex flex-col gap-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
          {category}
        </p>
        <h3 className="text-[15px] font-medium leading-snug">{name}</h3>
        <p className="text-[13px] text-muted leading-relaxed line-clamp-2">
          {description}
        </p>

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
      </div>
    </div>
  );
}
