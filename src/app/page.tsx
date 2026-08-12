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
      <div className="py-24 text-center text-[13px] text-muted">Loading</div>
    );
  }

  return (
    <div>
      {/* Editorial header, generous whitespace. */}
      <div className="text-center max-w-xl mx-auto mb-14">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted mb-4">
          The collection
        </p>
        <h1 className="text-[42px] leading-[1.1] font-light tracking-tight">
          Everyday essentials,
          <br />
          thoughtfully made.
        </h1>
        <p className="mt-5 text-[14px] text-muted leading-relaxed">
          {data.products.length} products, chosen to work together.
        </p>
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
          />
        ))}
      </div>
    </div>
  );
}
