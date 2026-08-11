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
      <div className="max-w-md mx-auto text-center py-12">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Order placed!</h1>
        <p className="text-gray-500 mb-1 text-sm">
          Order ID: <span className="font-mono">{order.orderId}</span>
        </p>
        <p className="text-gray-900 font-semibold mb-6">{order.orderTotalFormatted}</p>
        <a href="/" className="text-blue-600 hover:underline text-sm">
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
  }: {
    label: string;
    field: keyof typeof form;
    type?: string;
    placeholder?: string;
  }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={set(field)}
        placeholder={placeholder}
        required
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

      {/* Order summary */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 shadow-sm">
        {items.map((i) => (
          <div key={i.productId} className="flex justify-between text-sm py-1">
            <span className="text-gray-700">
              {i.emoji} {i.name} × {i.quantity}
            </span>
            <span className="text-gray-900">{formatPrice(i.price * i.quantity)}</span>
          </div>
        ))}
        <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between font-semibold text-sm">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Contact
          </h2>
          <Field label="Full name" field="name" placeholder="Jane Smith" />
          <Field label="Email" field="email" type="email" placeholder="jane@example.com" />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Shipping
          </h2>
          <Field label="Address" field="address" placeholder="123 Main St" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" field="city" placeholder="San Francisco" />
            <Field label="ZIP" field="zip" placeholder="94105" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Payment
          </h2>
          <Field
            label="Card number"
            field="cardNumber"
            placeholder="4242 4242 4242 4242"
          />
          <p className="text-xs text-gray-400">Demo only — no real payment processing</p>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Placing order…' : 'Place Order'}
        </button>
      </form>
    </div>
  );
}
