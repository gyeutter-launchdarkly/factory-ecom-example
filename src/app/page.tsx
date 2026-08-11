'use client';

import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  displayPrice: string;
  basePrice: number;
  rating: number;
  reviewCount: number;
}

interface ProductsResponse {
  products: Product[];
  flags: { showProductReviews: boolean };
}

export default function HomePage() {
  const [data, setData] = useState<ProductsResponse | null>(null);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div className="py-24 text-center text-[13px] text-muted">Loading</div>
    );
  }

  return (
    <div>
      <div className="mb-12 flex items-baseline justify-between">
        <h1 className="text-[32px] font-light tracking-tight">All products</h1>
        <p className="text-[13px] text-muted">{data.products.length} items</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
        {data.products.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            description={p.description}
            category={p.category}
            emoji={p.emoji}
            displayPrice={p.displayPrice}
            price={p.basePrice}
            showReviews={data.flags.showProductReviews}
            rating={p.rating}
            reviewCount={p.reviewCount}
          />
        ))}
      </div>
    </div>
  );
}
