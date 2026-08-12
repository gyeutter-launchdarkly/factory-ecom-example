'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/CartProvider';
import { formatPrice } from '@/lib/pricing';

interface OrderResult {
  orderId: string;
  orderTotalFormatted: string;
}

export default function CheckoutPage() {
  const { items, total, clear } = useCart();
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    address: '',
    city: '',
    zip: '',
    cardNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderResult | null>(null);

  if (items.length === 0 && !order) {
    router.replace('/cart');
    return null;
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          customer: {
            name: form.name,
            email: form.email,
            address: form.address,
            city: form.city,
            zip: form.zip,
          },
          payment: { cardNumber: form.cardNumber },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
      clear();
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (order) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="text-4xl mb-6">✓</p>
        <h1 className="text-4xl font-bold uppercase tracking-tight mb-2">Order Placed</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 mt-6">
          Order ID
        </p>
        <p className="font-mono text-sm mb-4">{order.orderId}</p>
        <p className="text-3xl font-bold font-mono mb-10">{order.orderTotalFormatted}</p>
        <a
          href="/"
          className="text-[10px] font-bold uppercase tracking-[0.2em] border-b-2 border-[#0a0a0a] pb-0.5 hover:text-[#005AFF] hover:border-[#005AFF] transition-colors"
        >
          Continue Shopping →
        </a>
      </div>
    );
  }

  const Field = ({
    label,
    field,
    type = 'text',
    placeholder = '',
    span2 = false,
  }: {
    label: string;
    field: keyof typeof form;
    type?: string;
    placeholder?: string;
    span2?: boolean;
  }) => (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={form[field]}
        onChange={set(field)}
        placeholder={placeholder}
        required
        className="w-full border-2 border-[#0a0a0a] px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-[#005AFF] transition-colors placeholder:text-gray-300"
      />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 pb-6 border-b-2 border-[#0a0a0a]">
        <h1 className="text-4xl font-bold uppercase tracking-tight">Checkout</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form — 3 cols */}
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-6">

          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-4 pb-2 border-b border-gray-200">
              Contact
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full Name" field="name" placeholder="Jane Smith" span2 />
              <Field label="Email" field="email" type="email" placeholder="jane@example.com" span2 />
            </div>
          </section>

          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-4 pb-2 border-b border-gray-200">
              Shipping
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Address" field="address" placeholder="123 Main St" span2 />
              <Field label="City" field="city" placeholder="San Francisco" />
              <Field label="ZIP" field="zip" placeholder="94105" />
            </div>
          </section>

          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-4 pb-2 border-b border-gray-200">
              Payment
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Card Number" field="cardNumber" placeholder="4242 4242 4242 4242" span2 />
            </div>
            <p className="text-[10px] text-gray-300 mt-2 uppercase tracking-widest">Demo — no real charges</p>
          </section>

          {error && (
            <p className="text-red-600 text-sm font-medium border-2 border-red-600 px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0a0a0a] text-white py-4 font-bold text-[10px] uppercase tracking-[0.25em] hover:bg-[#005AFF] disabled:opacity-40 transition-colors"
          >
            {loading ? 'Placing Order…' : 'Place Order →'}
          </button>
        </form>

        {/* Order summary — 2 cols */}
        <aside className="lg:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-4 pb-2 border-b-2 border-[#0a0a0a]">
            Summary
          </p>
          <div className="space-y-3">
            {items.map((i) => (
              <div key={i.productId} className="flex justify-between text-sm">
                <span className="text-gray-600 truncate pr-2">
                  {i.emoji} {i.name}
                  {i.quantity > 1 && (
                    <span className="text-gray-400 font-mono ml-1">×{i.quantity}</span>
                  )}
                </span>
                <span className="font-mono font-medium shrink-0">{formatPrice(i.price * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t-2 border-[#0a0a0a] flex justify-between items-baseline">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total</span>
            <span className="text-2xl font-bold font-mono">{formatPrice(total)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
