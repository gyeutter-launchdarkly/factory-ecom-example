import { NextRequest, NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { calculateOrderTotal, formatPrice } from '@/lib/pricing';
import { track } from '@/lib/ld';
import { createAndConfirmPayment } from '@/lib/stripe';
import type { CartItem } from '@/lib/pricing';

interface CheckoutBody {
  items: Array<{ productId: string; quantity: number }>;
  customer: {
    name: string;
    email: string;
    address: string;
    city: string;
    zip: string;
  };
  // stripePaymentMethodId replaces the raw cardNumber in the Stripe checkout flow.
  // The Stripe.js client tokenises card details and sends back a pm_xxx ID.
  payment: {
    stripePaymentMethodId: string;
  };
}

export async function POST(req: NextRequest) {
  let body: CheckoutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.items?.length) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  const items: CartItem[] = [];
  for (const line of body.items) {
    const product = getProduct(line.productId);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product: ${line.productId}` },
        { status: 400 },
      );
    }
    items.push({ product, quantity: line.quantity });
  }

  const orderTotal = calculateOrderTotal(items);
  const amountCents = Math.round(orderTotal * 100);
  const userKey = body.customer.email || 'anonymous';

  // Charge via Stripe. Falls back to mock when STRIPE_SECRET_KEY is absent.
  let paymentResult;
  try {
    paymentResult = await createAndConfirmPayment(
      amountCents,
      'usd',
      body.payment.stripePaymentMethodId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment failed';
    return NextResponse.json({ error: message }, { status: 402 });
  }

  if (paymentResult.status !== 'succeeded') {
    return NextResponse.json(
      { error: `Payment not completed: ${paymentResult.status}` },
      { status: 402 },
    );
  }

  const orderId = `ORD-${paymentResult.paymentIntentId}`;

  // Track checkout completion — the Metrics Author builds guarded-release
  // metrics on top of this event (error rate, latency, conversion).
  await track('checkout-completed', userKey, orderTotal, {
    orderId,
    paymentIntentId: paymentResult.paymentIntentId,
    paymentDemo: paymentResult.demo,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
  });

  return NextResponse.json({
    orderId,
    orderTotal,
    orderTotalFormatted: formatPrice(orderTotal),
    customer: body.customer,
    items: items.map((i) => ({
      productId: i.product.id,
      name: i.product.name,
      quantity: i.quantity,
      lineTotal: i.product.basePrice * i.quantity,
    })),
  });
}
