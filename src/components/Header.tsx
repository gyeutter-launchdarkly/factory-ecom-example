'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';

export function Header() {
  const { count } = useCart();

  return (
    <header className="border-b-2 border-[#0a0a0a] px-6 py-4 flex items-center justify-between bg-white">
      <Link href="/" className="text-sm font-bold tracking-[0.25em] uppercase hover:text-[#005AFF] transition-colors">
        MERIDIAN
      </Link>
      <nav className="flex items-center gap-8">
        <Link href="/" className="text-xs font-bold uppercase tracking-widest hover:text-[#005AFF] transition-colors">
          Shop
        </Link>
        <Link href="/cart" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-[#005AFF] transition-colors">
          Cart
          {count > 0 && (
            <span className="bg-[#0a0a0a] text-white text-xs w-5 h-5 flex items-center justify-center font-bold">
              {count}
            </span>
          )}
        </Link>
      </nav>
    </header>
  );
}
