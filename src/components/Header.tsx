'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';

export function Header() {
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur-sm border-b border-hair">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-[15px] font-medium tracking-[0.18em] uppercase hover:text-rose transition-colors"
        >
          DarkCommerce
        </Link>

        <nav className="flex items-center gap-7">
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
        </nav>
      </div>
    </header>
  );
}
