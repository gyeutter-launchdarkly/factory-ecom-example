'use client';

import { useCart } from './CartProvider';

interface ProductCardProps {
  id: string;
  name: string;
  description: string;
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
  emoji,
  displayPrice,
  price,
  showReviews,
}: ProductCardProps) {
  const { add } = useCart();
  const reviews = MOCK_REVIEWS[id];

  const handleAdd = () => add({ productId: id, name, emoji, price, displayPrice });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="text-5xl text-center py-2">{emoji}</div>
      <div>
        <h3 className="font-semibold text-gray-900">{name}</h3>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
      {/* Controlled by the show-product-reviews feature flag */}
      {showReviews && reviews && (
        <div className="text-sm text-yellow-500">
          {'★'.repeat(Math.round(reviews.rating))}
          {'☆'.repeat(5 - Math.round(reviews.rating))}
          <span className="text-gray-400 ml-1">({reviews.count})</span>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="font-bold text-gray-900">{displayPrice}</span>
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add to cart
        </button>
      </div>
    </div>
  );
}
