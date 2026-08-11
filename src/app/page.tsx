'use client';

import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';

interface Product {
  id: string;
  name: string;
  description: string;
  emoji: string;
  displayPrice: string;
  basePrice: number;
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
    return <div className="text-center py-20 text-gray-400">Loading products…</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">All Products</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.products.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            description={p.description}
            emoji={p.emoji}
            displayPrice={p.displayPrice}
            price={p.basePrice}
            showReviews={data.flags.showProductReviews}
          />
        ))}
      </div>
    </div>
  );
}
