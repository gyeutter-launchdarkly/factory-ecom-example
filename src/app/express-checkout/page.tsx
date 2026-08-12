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

  const [form, setForm] = useState({ name: '', email: '', cardNumber: '', expiry: '', cvc: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderResult | null>(null);

  if (!productId) {
    router.replace('/');
    return null;
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Demo convenience, mirroring the standard checkout: fill the form in one
  // click. Any card details are accepted; nothing is charged.
  const fillDemo = () =>
    setForm({
      name: 'Jane Smith',
      email: 'jane@example.com',
      cardNumber: '4242 4242 4242 4242',
      expiry: '12 / 34',
      cvc: '123',
    });

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
        <div className="w-14 h-14 rounded-pill bg-blush text-ink flex items-center justify-center mx-auto mb-7 text-xl">
          ✓
        </div>
        <h1 className="text-[30px] font-light tracking-tight">Thank you</h1>
        <p className="mt-3 text-[14px] text-muted">Your order is on its way.</p>

        <div className="mt-9 bg-white rounded-3xl shadow-soft px-6 py-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Order</p>
          <p className="text-[13px] mt-1">{order.orderId}</p>
          <p className="text-[24px] font-light mt-4">{order.orderTotalFormatted}</p>
        </div>

        <a
          href="/"
          className="mt-8 inline-block bg-ink text-cream text-[13px] font-medium px-7 py-3 rounded-pill hover:bg-rose hover:text-ink transition-colors"
        >
          Continue shopping
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-9">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted mb-3">Express checkout</p>
        <h1 className="text-[32px] font-light tracking-tight">Buy now</h1>
        <button
          type="button"
          onClick={fillDemo}
          className="mt-4 text-[12px] text-muted hover:text-ink underline decoration-hair hover:decoration-rose decoration-1 underline-offset-4 transition-colors"
        >
          Autofill demo details
        </button>
      </div>

      {/* Product summary */}
      <div className="bg-white rounded-3xl shadow-soft px-5 py-5 mb-7 flex items-center gap-4">
        <span className="w-14 h-14 rounded-2xl bg-shell flex items-center justify-center text-2xl shrink-0">
          {emoji}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium truncate">{name}</p>
          <p className="text-[13px] text-muted mt-0.5">Qty 1</p>
        </div>
        <span className="text-[16px] shrink-0">{displayPrice}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <section>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted mb-4">
            Contact
          </p>
          <div className="space-y-3">
            {[
              { label: 'Full name', field: 'name' as const, placeholder: 'Jane Smith' },
              { label: 'Email', field: 'email' as const, placeholder: 'jane@example.com' },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-[12px] text-muted mb-1.5">
                  {label}
                </label>
                <input
                  type={field === 'email' ? 'email' : 'text'}
                  value={form[field]}
                  onChange={set(field)}
                  placeholder={placeholder}
                  required
                  className="w-full bg-white border border-hair rounded-2xl px-4 py-3 text-[14px] focus:outline-none focus:border-rose transition-colors placeholder:text-muted/50"
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted mb-4">
            Payment
          </p>
          <div className="space-y-3">
            {[
              { label: 'Card number', field: 'cardNumber' as const, placeholder: '1234 5678 9012 3456' },
              { label: 'Expiry', field: 'expiry' as const, placeholder: 'MM / YY' },
              { label: 'CVC', field: 'cvc' as const, placeholder: '123' },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-[12px] text-muted mb-1.5">
                  {label}
                </label>
                <input
                  type="text"
                  value={form[field]}
                  onChange={set(field)}
                  placeholder={placeholder}
                  required
                  className="w-full bg-white border border-hair rounded-2xl px-4 py-3 text-[14px] focus:outline-none focus:border-rose transition-colors placeholder:text-muted/50"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-hair pt-4 flex justify-between items-baseline">
          <span className="text-[13px] text-muted">Total</span>
          <span className="text-[20px] font-light">{formatPrice(price)}</span>
        </div>

        {error && (
          <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ink text-cream py-4 rounded-pill text-[14px] font-medium hover:bg-rose hover:text-ink disabled:opacity-40 disabled:hover:bg-ink disabled:hover:text-cream transition-colors"
        >
          {loading ? 'Placing order' : `Pay ${formatPrice(price)}`}
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
