'use client';

import Link from 'next/link';
import { useCart } from '@/components/CartProvider';
import { formatPrice } from '@/lib/pricing';

export default function CartPage() {
  const { items, remove, update, total } = useCart();

  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6">Cart is empty</p>
        <Link href="/" className="text-[10px] font-bold uppercase tracking-[0.2em] border-b-2 border-[#0a0a0a] pb-0.5 hover:text-[#005AFF] hover:border-[#005AFF] transition-colors">
          Continue Shopping →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8 pb-6 border-b-2 border-[#0a0a0a]">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </p>
        <h1 className="text-4xl font-bold uppercase tracking-tight">Your Cart</h1>
      </div>

      <div className="border-2 border-[#0a0a0a]">
        {items.map((item, i) => (
          <div
            key={item.productId}
            className={`flex items-center gap-4 p-5 ${i < items.length - 1 ? 'border-b-2 border-[#0a0a0a]' : ''}`}
          >
            <span className="text-3xl w-10 text-center">{item.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold uppercase tracking-tight text-sm">{item.name}</p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{item.displayPrice}</p>
            </div>
            <div className="flex items-center gap-0 border-2 border-[#0a0a0a]">
              <button
                onClick={() => update(item.productId, item.quantity - 1)}
                className="w-8 h-8 flex items-center justify-center text-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white transition-colors font-bold text-lg"
              >
                −
              </button>
              <span className="w-8 h-8 flex items-center justify-center text-sm font-bold border-x-2 border-[#0a0a0a]">
                {item.quantity}
              </span>
              <button
                onClick={() => update(item.productId, item.quantity + 1)}
                className="w-8 h-8 flex items-center justify-center text-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white transition-colors font-bold text-lg"
              >
                +
              </button>
            </div>
            <button
              onClick={() => remove(item.productId)}
              className="text-gray-300 hover:text-[#0a0a0a] text-xl transition-colors w-6 text-center font-bold"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-between items-baseline border-b-2 border-[#0a0a0a] pb-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Total</span>
        <span className="text-3xl font-bold font-mono">{formatPrice(total)}</span>
      </div>

      <Link
        href="/checkout"
        className="mt-6 block w-full bg-[#0a0a0a] text-white text-center py-4 font-bold text-[10px] uppercase tracking-[0.25em] hover:bg-[#005AFF] transition-colors"
      >
        Proceed to Checkout →
      </Link>

      <div className="mt-4 text-center">
        <Link href="/" className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-[#0a0a0a] transition-colors">
          ← Continue Shopping
        </Link>
      </div>
    </div>
  );
}
