'use client';

import Link from 'next/link';
import { useCart } from './CartProvider';
import { ThemeToggle } from './ThemeToggle';
import { useDemoProfile } from '@/lib/use-demo-profile';

export function Header() {
  const { count } = useCart();
  const { profile } = useDemoProfile();

  if (profile === 'cat') {
    return (
      <header className="sticky top-0 z-30 text-white shadow-md">
        <div className="bg-[#292929] border-b border-[#4a4a4a]">
          <div className="max-w-6xl mx-auto px-6 h-8 flex items-center justify-between text-[11px]">
            <span>United States · English</span>
            <nav className="flex gap-5 text-[#ddd]">
              <span>Find a Dealer</span>
              <span>Help Center</span>
              <span>Order Status</span>
            </nav>
          </div>
        </div>
        <div className="bg-black">
          <div className="max-w-6xl mx-auto px-6 h-[76px] flex items-center gap-8">
            <Link href="/" aria-label="Cat Parts Store" className="shrink-0">
              <img
                src="/cat/logo.png"
                alt="Cat"
                className="w-[92px] h-auto"
                referrerPolicy="no-referrer"
              />
            </Link>
            <div className="hidden md:flex flex-1 h-11 bg-white">
              <input
                className="flex-1 min-w-0 px-4 text-black text-[13px] outline-none"
                placeholder="Search for part number or name"
                aria-label="Search parts"
              />
              <button className="bg-[#ffcd11] text-black font-bold px-5" aria-label="Search">
                ⌕
              </button>
            </div>
            <nav className="ml-auto flex items-center gap-6 text-[12px]">
              <span className="hidden sm:inline">Select Store</span>
              <span className="hidden sm:inline">Sign In</span>
              <Link href="/cart" className="flex items-center gap-2 font-bold">
                Cart
                {count > 0 && (
                  <span className="bg-[#ffcd11] text-black min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[10px]">
                    {count}
                  </span>
                )}
              </Link>
            </nav>
          </div>
        </div>
        <nav className="bg-white text-black border-b border-[#d5d5d5]">
          <div className="max-w-6xl mx-auto px-6 h-11 flex items-center gap-8 text-[12px] font-bold">
            <span>SHOP BY CATEGORY</span>
            <span>PARTS DIAGRAM</span>
            <span>MY EQUIPMENT</span>
            <span className="hidden md:inline">QUICK ORDER</span>
            <span className="hidden md:inline">ABOUT CAT PARTS</span>
          </div>
        </nav>
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
