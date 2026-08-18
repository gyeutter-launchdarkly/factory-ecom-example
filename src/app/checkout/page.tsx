'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/CartProvider';
import { formatPrice } from '@/lib/pricing';

interface OrderResult {
  orderId: string;
  orderTotalFormatted: string;
  discountApplied?: { code: string; amount: number } | null;
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
    expiry: '',
    cvc: '',
    discountCode: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [showDiscountCodes, setShowDiscountCodes] = useState(false);

  // Evaluate enable-discount-codes flag on mount
  useEffect(() => {
    const fetchFlag = async () => {
      try {
        const res = await fetch('/api/flags/enable-discount-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userKey: form.email || 'anonymous' }),
        });
        const data = await res.json();
        setShowDiscountCodes(data.enableDiscountCodes ?? false);
      } catch {
        // Gracefully fall back to false if flag evaluation fails
        setShowDiscountCodes(false);
      }
    };
    fetchFlag();
  }, []);

  if (items.length === 0 && !order) {
    router.replace('/cart');
    return null;
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Demo convenience: fill the whole form in one click so a walkthrough does
  // not stall on typing. Any card details are accepted; nothing is charged.
  const fillDemo = () =>
    setForm({
      name: 'Jane Smith',
      email: 'jane@example.com',
      address: '123 Market St',
      city: 'San Francisco',
      zip: '94105',
      cardNumber: '4242 4242 4242 4242',
      expiry: '12 / 34',
      cvc: '123',
      discountCode: '',
    });

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
          discountCode: form.discountCode || undefined,
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
        <div className="w-14 h-14 rounded-pill bg-blush text-ink flex items-center justify-center mx-auto mb-7 text-xl">
          ✓
        </div>
        <h1 className="text-[30px] font-light tracking-tight">Order confirmed</h1>

        <div className="mt-9 bg-white rounded-3xl shadow-soft px-6 py-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Order</p>
          <p className="text-[13px] mt-1">{order.orderId}</p>
          <p className="text-[24px] font-light mt-4">{order.orderTotalFormatted}</p>
          {order.discountApplied && (
            <p className="text-[12px] text-rose mt-2">
              {order.discountApplied.code} applied, saved{' '}
              {formatPrice(order.discountApplied.amount)}
            </p>
          )}
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
      <label className="block text-[12px] text-muted mb-1.5">{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={set(field)}
        placeholder={placeholder}
        required
        className="w-full bg-white border border-hair rounded-2xl px-4 py-3 text-[14px] focus:outline-none focus:border-rose transition-colors placeholder:text-muted/50"
      />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-[32px] font-light tracking-tight">Checkout</h1>
        <button
          type="button"
          onClick={fillDemo}
          className="mt-4 text-[12px] text-muted hover:text-ink underline decoration-hair hover:decoration-rose decoration-1 underline-offset-4 transition-colors"
        >
          Autofill demo details
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-8">
          <section>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted mb-4">Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" field="name" placeholder="Jane Smith" span2 />
              <Field label="Email" field="email" type="email" placeholder="jane@example.com" span2 />
            </div>
          </section>

          <section>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted mb-4">Shipping</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Address" field="address" placeholder="123 Main St" span2 />
              <Field label="City" field="city" placeholder="San Francisco" />
              <Field label="ZIP" field="zip" placeholder="94105" />
            </div>
          </section>

          <section>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted mb-4">Payment</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Card number" field="cardNumber" placeholder="1234 5678 9012 3456" span2 />
              <Field label="Expiry" field="expiry" placeholder="MM / YY" />
              <Field label="CVC" field="cvc" placeholder="123" />
            </div>
          </section>

          {/* Discount code. Gated by enable-discount-codes flag. */}
          {showDiscountCodes && (
            <section>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted mb-4">Discount</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount code" field="discountCode" placeholder="SAVE10" span2 />
              </div>
            </section>
          )}

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
            {loading ? 'Placing order' : `Pay ${formatPrice(total)}`}
          </button>
        </form>

        <aside className="lg:col-span-2">
          <div className="bg-white rounded-3xl shadow-soft px-5 py-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted mb-4">Summary</p>

            <div className="space-y-3">
              {items.map((i) => (
                <div key={i.productId} className="flex justify-between text-[13px] gap-2">
                  <span className="text-muted truncate">
                    {i.emoji} {i.name}
                    {i.quantity > 1 && <span className="text-muted/70"> ×{i.quantity}</span>}
                  </span>
                  <span className="shrink-0">{formatPrice(i.price * i.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-hair flex justify-between items-baseline">
              <span className="text-[13px] text-muted">Total</span>
              <span className="text-[20px] font-light">{formatPrice(total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
