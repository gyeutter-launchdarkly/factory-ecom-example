'use client';

import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { CatPartsHome } from '@/components/CatPartsHome';
import { useDemoProfile } from '@/lib/use-demo-profile';

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  displayPrice: string;
  basePrice: number;
  partNumber?: string;
  imageUrl?: string;
}

interface ProductsResponse {
  profile: 'commerce' | 'cat';
  products: Product[];
  flags: { showProductReviews: boolean; catalogSortOrder: string };
}

export default function HomePage() {
  const [data, setData] = useState<ProductsResponse | null>(null);
  const { profile } = useDemoProfile();

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch('/api/products', { cache: 'no-store' })
      .then((r) => r.json())
      .then((next: ProductsResponse) => {
        // A response for the storefront we just left must not land on top of
        // the one we switched to.
        if (alive) setData(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [profile]);

  // The header and the catalog arrive from two different requests, so they can
  // briefly disagree about which storefront this is. Waiting for them to agree
  // is the difference between a clean switch and CAT parts under a
  // DarkCommerce header.
  if (!data || data.profile !== profile) {
    return <div className="py-24 text-center text-[13px] text-muted">Loading</div>;
  }

  if (profile === 'cat') {
    return <CatPartsHome products={data.products} />;
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
