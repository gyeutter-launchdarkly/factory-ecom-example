import { NextRequest, NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { calculateOrderTotal, applyDiscountCode, formatPrice } from '@/lib/pricing';
import { track, stringVariation } from '@/lib/ld';
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
  payment: {
    cardNumber: string;
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

  const subtotal = calculateOrderTotal(items);
  const userKey = body.customer.email || 'anonymous';

  // Check if discount codes feature is enabled via feature flag
  const discountCodesEnabled = await stringVariation('enable-discount-codes', userKey, 'control') === 'v1';

  // Apply discount code if provided
  let orderTotal = subtotal;
  let discountApplied: { code: string; amount: number } | null = null;

  if (body.discountCode) {
    if (!discountCodesEnabled) {
      // Track that discount was rejected because feature is off
      await track('enable-discount-codes-error', userKey, undefined, {
        reason: 'feature_disabled',
        discountCode: body.discountCode,
      });
      return NextResponse.json(
        { error: 'Discount codes are not currently enabled' },
        { status: 400 },
      );
    }
    const result = applyDiscountCode(body.discountCode, subtotal);
    if (!result) {
      // Track that discount code is invalid
      await track('enable-discount-codes-error', userKey, undefined, {
        reason: 'invalid_code',
        discountCode: body.discountCode,
      });
      return NextResponse.json(
        { error: `Invalid discount code: ${body.discountCode}` },
        { status: 400 },
      );
    }
    orderTotal = result.discountedTotal;
    discountApplied = { code: result.code, amount: result.discountAmount };
  }

  const orderId = `ORD-${Date.now()}`;

  // Track checkout completion — the Metrics Author builds guarded-release
  // metrics on top of this event (error rate, latency, conversion).
  await track('checkout-completed', userKey, orderTotal, {
    orderId,
    subtotal,
    discountCode: discountApplied?.code ?? null,
    discountAmount: discountApplied?.amount ?? 0,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
  });

  return NextResponse.json({
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
      lineTotal: i.product.basePrice * i.quantity,
    })),
  });
}
