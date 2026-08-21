'use client';

import { useCart } from './CartProvider';
import type { PackStorefront as Storefront } from '@/lib/demo-pack';

// Renders whatever store the selected demo pack describes. Everything here is
// driven by the pack's storefront.json — words, colours, artwork and catalog —
// so a customer-shaped demo needs no code in this repository.

type CatalogItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  displayPrice: string;
  basePrice: number;
  sku?: string;
  image?: string;
};

function Card({
  product,
  cta,
  priceNote,
}: {
  product: CatalogItem;
  cta: string;
  priceNote?: string;
}) {
  const { add } = useCart();

  return (
    <article className="flex flex-col min-w-0 border pack-border bg-[var(--pack-surface)]">
      <div className="h-44 flex items-center justify-center p-4 border-b pack-border">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-5xl">{product.emoji}</span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        {product.sku && (
          <p className="text-[12px] font-bold text-[var(--pack-muted)]">{product.sku}</p>
        )}
        <h3 className="mt-1 text-[16px] font-bold leading-tight">{product.name}</h3>
        <p className="mt-2 text-[13px] leading-snug text-[var(--pack-muted)] flex-1">
          {product.description}
        </p>
        <p className="mt-4 text-[18px] font-bold">{product.displayPrice}</p>
        {priceNote && <p className="mt-1 text-[11px] text-[var(--pack-muted)]">{priceNote}</p>}

        <button
          onClick={() =>
            add({
              productId: product.id,
              name: product.name,
              emoji: product.emoji,
              price: product.basePrice,
              displayPrice: product.displayPrice,
            })
          }
          className="mt-4 w-full py-3 text-[13px] font-bold transition-opacity hover:opacity-90 bg-[var(--pack-accent)] text-[var(--pack-accent-ink)]"
        >
          {cta}
        </button>
      </div>
    </article>
  );
}

export function PackStorefront({
  storefront,
  products,
}: {
  storefront: Storefront;
  products: CatalogItem[];
}) {
  const { hero, callout, featured, categories, highlights } = storefront;

  return (
    <div className="pack-store -mx-6 -mt-14 pb-12">
      {hero && (
        <section
          className="relative min-h-[296px] bg-cover bg-center flex items-center"
          style={{
            backgroundImage: [
              'linear-gradient(90deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.58) 44%, rgba(0,0,0,.08) 72%)',
              hero.image ? `url('${hero.image}')` : 'linear-gradient(0deg, #1a1a1a, #1a1a1a)',
            ].join(', '),
          }}
        >
          <div className="w-full max-w-6xl mx-auto px-6 py-12 text-white">
            {hero.eyebrow && (
              <p className="text-[13px] font-bold uppercase tracking-[.12em] text-[var(--pack-accent)]">
                {hero.eyebrow}
              </p>
            )}
            {hero.headline && (
              <h1 className="mt-3 max-w-xl text-[36px] md:text-[44px] leading-[1.05] font-bold">
                {hero.headline}
              </h1>
            )}
            {hero.searchPlaceholder && (
              <div className="mt-7 max-w-2xl flex bg-white shadow-lg">
                <input
                  aria-label={hero.searchPlaceholder}
                  placeholder={hero.searchPlaceholder}
                  className="min-w-0 flex-1 px-5 py-4 text-[14px] text-black outline-none"
                />
                <button className="px-7 text-[13px] font-bold bg-[var(--pack-accent)] text-[var(--pack-accent-ink)]">
                  {hero.cta ?? 'SEARCH'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {callout && (
        <section className="bg-[var(--pack-shell)] border-y pack-border">
          <div className="max-w-6xl mx-auto px-6 py-6 grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <h2 className="text-[20px] font-bold">{callout.title}</h2>
              <p className="text-[13px] text-[var(--pack-muted)]">{callout.body}</p>
            </div>
            {callout.cta && (
              <button className="px-7 py-3.5 text-[13px] font-bold bg-[var(--pack-ink)] text-[var(--pack-surface)] hover:opacity-90">
                {callout.cta}
              </button>
            )}
          </div>
        </section>
      )}

      <div className="max-w-6xl mx-auto px-6">
        <section className="py-11">
          <div className="flex items-end justify-between mb-6">
            <div>
              {featured?.eyebrow && (
                <p className="text-[12px] font-bold uppercase tracking-[.12em] text-[var(--pack-muted)]">
                  {featured.eyebrow}
                </p>
              )}
              <h2 className="mt-1 text-[30px] font-bold">{featured?.title ?? 'Featured'}</h2>
            </div>
            {featured?.cta && (
              <button className="text-[13px] font-bold border-b-2 pb-1 border-[var(--pack-accent)]">
                {featured.cta}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {products.map((product) => (
              <Card
                key={product.id}
                product={product}
                cta={storefront.productCta ?? 'Add to cart'}
                priceNote={storefront.priceNote}
              />
            ))}
          </div>
        </section>

        {categories && (
          <section className="py-11 border-t pack-border">
            <h2 className="text-[30px] font-bold mb-7">{categories.title ?? 'Shop by category'}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {categories.items.map((category) => (
                <button
                  key={category.name}
                  className="text-left border pack-border bg-[var(--pack-surface)] hover:shadow-md transition-shadow"
                >
                  <div className="h-40 p-3 flex items-center justify-center">
                    {category.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={category.image} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-4xl">◈</span>
                    )}
                  </div>
                  <div className="border-t pack-border px-4 py-4 text-[14px] font-bold">
                    {category.name}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {highlights && (
          <section className="my-8 grid md:grid-cols-3 bg-[var(--pack-ink)] text-[var(--pack-surface)]">
            {highlights.map((highlight, index) => (
              <div
                key={highlight.title}
                className={`p-7 ${index ? 'md:border-l border-white/20' : ''}`}
              >
                <div className="w-8 h-1 mb-5 bg-[var(--pack-accent)]" />
                <h3 className="text-[18px] font-bold">{highlight.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed opacity-80">{highlight.body}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
