'use client';

import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { PackStorefront } from '@/components/PackStorefront';
import { useDemoPack } from '@/lib/use-demo-pack';

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  displayPrice: string;
  basePrice: number;
  sku?: string;
  image?: string;
}

interface ProductsResponse {
  pack: string;
  products: Product[];
  flags: { showProductReviews: boolean; catalogSortOrder: string };
}

export default function HomePage() {
  const pack = useDemoPack();
  const [data, setData] = useState<ProductsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/products', { cache: 'no-store' })
      .then((r) => r.json())
      // A response for the store we just left must not land on the one we
      // switched to.
      .then((next: ProductsResponse) => alive && setData(next))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pack.id]);

  // The branding and the catalog arrive from two different requests and can
  // briefly disagree about which store this is. Waiting for them to agree is
  // the difference between a clean switch and one store's parts under
  // another's header.
  if (!data || data.pack !== pack.id) {
    return <div className="py-24 text-center text-[13px] text-muted">Loading</div>;
  }

  if (pack.storefront) {
    return <PackStorefront storefront={pack.storefront} products={data.products} />;
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
          />
        ))}
      </div>
    </div>
  );
}
