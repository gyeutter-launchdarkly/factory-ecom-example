import { shopperKey, withShopper } from '@/lib/shopper';
import { NextRequest, NextResponse } from 'next/server';
import { resolveProduct } from '@/lib/catalog';
import { calculateOrderTotal, calculateLineTotal, applyDiscountCode, formatPrice } from '@/lib/pricing';
import { track, stringVariation } from '@/lib/ld';
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
  discountCode?: string;
}

export async function POST(req: NextRequest) {
  let body: CheckoutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !Array.isArray(body.items) || !body.items.length || body.items.length > 100) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  if (!body.customer || ['name', 'email', 'address', 'city', 'zip'].some(key => {
    const value = body.customer[key as keyof CheckoutBody['customer']];
    return typeof value !== 'string' || !value.trim() || value.length > 500;
  }) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer.email)) {
    return NextResponse.json({ error: 'Enter valid contact and shipping details' }, { status: 400 });
  }
  const items: CartItem[] = [];
  for (const line of body.items) {
    if (!line || typeof line.productId !== 'string' || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100) {
      return NextResponse.json({ error: 'Quantities must be whole numbers from 1 to 100' }, { status: 400 });
    }
    const product = await resolveProduct(line.productId);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product: ${line.productId}` },
        { status: 400 },
      );
    }
    items.push({ product, quantity: line.quantity });
  }

  const subtotal = calculateOrderTotal(items);
  const userKey = shopperKey(req);

  // Evaluate feature flag for discount code support
  const discountCodeVariant = await stringVariation('enable-discount-codes', userKey, 'control');
  const discountCodesEnabled = discountCodeVariant === 'v1';

  // Apply discount code if provided and flag is enabled
  let orderTotal = subtotal;
  let discountApplied: { code: string; amount: number } | null = null;

  if (discountCodesEnabled && body.discountCode) {
    const result = applyDiscountCode(body.discountCode, subtotal);
    if (!result) {
      // Track discount code validation error for guarded-release monitoring
      await track('enable-discount-codes-error', userKey);
      return NextResponse.json(
        { error: `Invalid discount code: ${body.discountCode}` },
        { status: 400 },
      );
    }
    orderTotal = result.discountedTotal;
    discountApplied = { code: result.code, amount: result.discountAmount };
    // Track successful discount code application for guarded-release monitoring
    await track('enable-discount-codes-success', userKey);
  }

  const amountCents = Math.round(orderTotal * 100);

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
    subtotal,
    discountCode: discountApplied?.code ?? null,
    discountAmount: discountApplied?.amount ?? 0,
    paymentIntentId: paymentResult.paymentIntentId,
    paymentDemo: paymentResult.demo,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
  });

  return withShopper(NextResponse.json({
    orderId,
    subtotal,
    discountApplied,
    orderTotal,
    orderTotalFormatted: formatPrice(orderTotal),
    customer: body.customer,
    items: items.map((i) => ({
      productId: i.product.id,
      name: i.product.name,
      quantity: i.quantity,
      lineTotal: calculateLineTotal(i),
    })),
  }), userKey);
}
