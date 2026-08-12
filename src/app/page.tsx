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
      <div className="py-20 text-center text-xs font-bold uppercase tracking-widest text-gray-300">
        Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-10 pb-6 border-b-2 border-[#0a0a0a]">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">
          {data.products.length} products
        </p>
        <h1 className="text-5xl font-bold uppercase tracking-tight">All Products</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#0a0a0a] border-2 border-[#0a0a0a]">
        {data.products.map((p) => (
          <div key={p.id} className="bg-white">
            <ProductCard
              id={p.id}
              name={p.name}
              description={p.description}
              category={p.category}
              emoji={p.emoji}
              displayPrice={p.displayPrice}
              price={p.basePrice}
              showReviews={data.flags.showProductReviews}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
