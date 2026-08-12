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
}: ProductCardProps) {
  const { add } = useCart();
  const reviews = MOCK_REVIEWS[id];

  const handleAdd = () => add({ productId: id, name, emoji, price, displayPrice });

  return (
    <div className="flex flex-col group">
      {/* Image area */}
      <div className="border-b-2 border-[#0a0a0a] p-10 flex items-center justify-center bg-[#f8f8f8] group-hover:bg-[#0a0a0a] transition-colors duration-200">
        <span className="text-6xl select-none">{emoji}</span>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-2 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">{category}</p>
        <h3 className="font-bold text-[#0a0a0a] uppercase tracking-tight leading-tight">{name}</h3>
        <p className="text-sm text-gray-500 flex-1 leading-relaxed">{description}</p>

        {/* Controlled by the show-product-reviews feature flag */}
        {showReviews && reviews && (
          <p className="text-xs text-gray-400 font-mono">
            {'★'.repeat(Math.round(reviews.rating))}{'☆'.repeat(5 - Math.round(reviews.rating))}
            {' '}({reviews.count})
          </p>
        )}

        <div className="flex items-end justify-between pt-4 mt-auto border-t-2 border-[#0a0a0a]">
          <span className="text-2xl font-bold font-mono">{displayPrice}</span>
          <button
            onClick={handleAdd}
            className="bg-[#0a0a0a] text-white text-[10px] font-bold uppercase tracking-[0.2em] px-5 py-2.5 hover:bg-[#005AFF] transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
