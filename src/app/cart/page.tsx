'use client';

import Link from 'next/link';
import { useCart } from '@/components/CartProvider';
import { formatPrice, getTieredDiscount } from '@/lib/pricing';

export default function CartPage() {
  const { items, remove, update, total } = useCart();

  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-[15px] text-muted mb-6">Your bag is empty.</p>
        <Link
          href="/"
          className="inline-block bg-ink text-cream text-[13px] font-medium px-7 py-3 rounded-pill hover:bg-rose hover:text-ink transition-colors"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-[32px] font-light tracking-tight">Your bag</h1>
        <p className="mt-2 text-[13px] text-muted">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-soft overflow-hidden">
        {items.map((item, i) => (
          <div
            key={item.productId}
            className={`flex items-center gap-4 px-5 py-5 ${i < items.length - 1 ? 'border-b border-hair' : ''}`}
          >
            <span className="w-14 h-14 rounded-2xl bg-shell flex items-center justify-center text-2xl shrink-0">
              {item.emoji}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium truncate">{item.name}</p>
              <p className="text-[13px] text-muted mt-0.5">{item.displayPrice}</p>
              {getTieredDiscount(item.quantity) > 0 && (
                <p className="text-[12px] text-rose mt-0.5">
                  {getTieredDiscount(item.quantity) * 100}% bulk discount
                </p>
              )}
            </div>

            <div className="flex items-center gap-1 bg-shell rounded-pill p-1">
              <button
                onClick={() => update(item.productId, item.quantity - 1)}
                className="w-7 h-7 rounded-pill flex items-center justify-center text-muted hover:bg-white hover:text-ink transition-colors"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-6 text-center text-[13px] font-medium">{item.quantity}</span>
              <button
                onClick={() => update(item.productId, item.quantity + 1)}
                className="w-7 h-7 rounded-pill flex items-center justify-center text-muted hover:bg-white hover:text-ink transition-colors"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button
              onClick={() => remove(item.productId)}
              className="text-muted/60 hover:text-ink text-lg transition-colors w-6 text-center"
              aria-label={`Remove ${item.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-between items-baseline px-1">
        <span className="text-[13px] text-muted">Subtotal</span>
        <span className="text-[22px] font-light">{formatPrice(total)}</span>
      </div>

      <Link
        href="/checkout"
        className="mt-7 block w-full bg-ink text-cream text-center py-4 rounded-pill text-[14px] font-medium hover:bg-rose hover:text-ink transition-colors"
      >
        Checkout
      </Link>

      <div className="mt-5 text-center">
        <Link href="/" className="text-[13px] text-muted hover:text-ink transition-colors">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
