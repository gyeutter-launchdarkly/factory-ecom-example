'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';
import { ThemeToggle } from './ThemeToggle';
import { useDemoPack } from '@/lib/use-demo-pack';

export function Header() {
  const { count } = useCart();
  const pack = useDemoPack();
  const storefront = pack.storefront;

  // A pack storefront brings its own masthead: logo, utility bar and category
  // nav are all pack data, so this branch is the same code for every customer.
  if (storefront) {
    const { brand, header } = storefront;
    return (
      <header className="sticky top-0 z-30 shadow-md text-[var(--pack-header-ink)]">
        {header.topLinks.length > 0 && (
          <div className="bg-[var(--pack-topbar-bg)] border-b border-white/15">
            <div className="max-w-6xl mx-auto px-6 h-8 flex items-center justify-end gap-5 text-[11px] opacity-90">
              {header.topLinks.map((link) => (
                <span key={link}>{link}</span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[var(--pack-header-bg)]">
          <div className="max-w-6xl mx-auto px-6 h-[76px] flex items-center gap-8">
            <Link href="/" aria-label={brand.name} className="shrink-0">
              {brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logo} alt={brand.name} className="w-[92px] h-auto" />
              ) : (
                <span className="text-[16px] font-bold tracking-wide">{brand.name}</span>
              )}
            </Link>

            {header.searchPlaceholder && (
              <div className="hidden md:flex flex-1 h-11 bg-white">
                <input
                  className="flex-1 min-w-0 px-4 text-black text-[13px] outline-none"
                  placeholder={header.searchPlaceholder}
                  aria-label={header.searchPlaceholder}
                />
                <button
                  className="px-5 font-bold bg-[var(--pack-accent)] text-[var(--pack-accent-ink)]"
                  aria-label="Search"
                >
                  ⌕
                </button>
              </div>
            )}

            <nav className="ml-auto flex items-center gap-6 text-[12px]">
              {header.utilityLinks.map((link) => (
                <span key={link} className="hidden sm:inline">
                  {link}
                </span>
              ))}
              <Link href="/cart" className="flex items-center gap-2 font-bold">
                Cart
                {count > 0 && (
                  <span className="min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[10px] bg-[var(--pack-accent)] text-[var(--pack-accent-ink)]">
                    {count}
                  </span>
                )}
              </Link>
            </nav>
          </div>
        </div>

        {header.nav.length > 0 && (
          <nav className="bg-[var(--pack-surface)] text-[var(--pack-ink)] border-b pack-border">
            <div className="max-w-6xl mx-auto px-6 h-11 flex items-center gap-8 text-[12px] font-bold">
              {header.nav.map((item, index) => (
                <span key={item} className={index > 2 ? 'hidden md:inline' : ''}>
                  {item}
                </span>
              ))}
            </div>
          </nav>
        )}
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur-sm border-b border-hair">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-[15px] font-medium tracking-[0.18em] uppercase hover:text-rose transition-colors"
        >
          DarkCommerce
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="text-[13px] text-muted hover:text-ink transition-colors"
          >
            Shop
          </Link>
          <Link
            href="/cart"
            className="flex items-center gap-2 text-[13px] text-muted hover:text-ink transition-colors"
          >
            Cart
            {count > 0 && (
              <span className="bg-blush text-ink text-[11px] min-w-5 h-5 px-1.5 rounded-pill flex items-center justify-center font-medium">
                {count}
              </span>
            )}
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
