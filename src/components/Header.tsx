'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';

export function Header() {
  const { count } = useCart();

  return (
    <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold tracking-tight hover:text-gray-300 transition-colors">
        Meridian
      </Link>
      <nav className="flex items-center gap-6 text-sm">
        <Link href="/" className="hover:text-gray-300 transition-colors">
          Shop
        </Link>
        <Link href="/cart" className="relative hover:text-gray-300 transition-colors">
          Cart
          {count > 0 && (
            <span className="absolute -top-2 -right-4 bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
              {count}
            </span>
          )}
        </Link>
      </nav>
    </header>
  );
}
