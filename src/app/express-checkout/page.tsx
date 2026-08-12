'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatPrice } from '@/lib/pricing';

interface OrderResult {
  orderId: string;
  orderTotalFormatted: string;
}

function ExpressCheckoutForm() {
  const router = useRouter();
  const params = useSearchParams();

  const productId = params.get('productId') ?? '';
  const name = params.get('name') ?? '';
  const emoji = params.get('emoji') ?? '';
  const displayPrice = params.get('displayPrice') ?? '';
  const price = parseFloat(params.get('price') ?? '0');

  const [form, setForm] = useState({ name: '', email: '', cardNumber: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderResult | null>(null);

  if (!productId) {
    router.replace('/');
    return null;
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/express-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: { productId, quantity: 1 },
          customer: { name: form.name, email: form.email },
          payment: { cardNumber: form.cardNumber },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
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
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 mt-6">Order ID</p>
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

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8 pb-6 border-b-2 border-[#0a0a0a]">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">
          Express Checkout
        </p>
        <h1 className="text-4xl font-bold uppercase tracking-tight">Buy Now</h1>
      </div>

      {/* Product summary */}
      <div className="border-2 border-[#0a0a0a] p-5 mb-6 flex items-center gap-4">
        <span className="text-4xl">{emoji}</span>
        <div className="flex-1">
          <p className="font-bold uppercase tracking-tight">{name}</p>
          <p className="text-xs text-gray-400 font-mono mt-0.5">Qty: 1</p>
        </div>
        <span className="text-xl font-bold font-mono">{displayPrice}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3 pb-2 border-b border-gray-200">
            Contact
          </p>
          <div className="space-y-3">
            {[
              { label: 'Full Name', field: 'name' as const, placeholder: 'Jane Smith' },
              { label: 'Email', field: 'email' as const, placeholder: 'jane@example.com' },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-1.5">
                  {label}
                </label>
                <input
                  type={field === 'email' ? 'email' : 'text'}
                  value={form[field]}
                  onChange={set(field)}
                  placeholder={placeholder}
                  required
                  className="w-full border-2 border-[#0a0a0a] px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-[#005AFF] transition-colors placeholder:text-gray-300"
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3 pb-2 border-b border-gray-200">
            Payment
          </p>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-1.5">
              Card Number
            </label>
            <input
              type="text"
              value={form.cardNumber}
              onChange={set('cardNumber')}
              placeholder="4242 4242 4242 4242"
              required
              className="w-full border-2 border-[#0a0a0a] px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-[#005AFF] transition-colors placeholder:text-gray-300"
            />
            <p className="text-[10px] text-gray-300 mt-1.5 uppercase tracking-widest">Demo — no real charges</p>
          </div>
        </section>

        <div className="border-t-2 border-[#0a0a0a] pt-4 flex justify-between items-baseline">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total</span>
          <span className="text-2xl font-bold font-mono">{formatPrice(price)}</span>
        </div>

        {error && (
          <p className="text-red-600 text-sm font-medium border-2 border-red-600 px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#0a0a0a] text-white py-4 font-bold text-[10px] uppercase tracking-[0.25em] hover:bg-[#005AFF] disabled:opacity-40 transition-colors"
        >
          {loading ? 'Placing Order…' : 'Place Order →'}
        </button>
      </form>
    </div>
  );
}

export default function ExpressCheckoutPage() {
  return (
    <Suspense>
      <ExpressCheckoutForm />
    </Suspense>
  );
}
