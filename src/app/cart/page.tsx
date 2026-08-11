'use client';

import Link from 'next/link';
import { useCart } from '@/components/CartProvider';
import { formatPrice } from '@/lib/pricing';

export default function CartPage() {
  const { items, remove, update, total } = useCart();

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">Your cart is empty.</p>
        <Link href="/" className="text-blue-600 hover:underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Your Cart</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y">
        {items.map((item) => (
          <div key={item.productId} className="flex items-center gap-4 p-4">
            <span className="text-3xl">{item.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{item.name}</p>
              <p className="text-sm text-gray-500">{item.displayPrice}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => update(item.productId, item.quantity - 1)}
                className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
              <button
                onClick={() => update(item.productId, item.quantity + 1)}
                className="w-7 h-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                +
              </button>
            </div>
            <button
              onClick={() => remove(item.productId)}
              className="text-gray-300 hover:text-red-400 text-xl ml-1 transition-colors"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-between items-center font-semibold text-gray-900 px-1">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>

      <Link
        href="/checkout"
        className="mt-6 block w-full bg-blue-600 text-white text-center py-3 rounded-xl hover:bg-blue-700 transition-colors font-medium"
      >
        Proceed to Checkout
      </Link>
    </div>
  );
}
