import { randomUUID } from 'node:crypto';
import { shopperKey, withShopper } from '@/lib/shopper';
import { NextRequest, NextResponse } from 'next/server';
import { resolveProduct } from '@/lib/catalog';
import { calculateOrderTotal, calculateLineTotal, applyDiscountCode, formatPrice } from '@/lib/pricing';
import { track } from '@/lib/ld';
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

  // Apply discount code if provided
  let orderTotal = subtotal;
  let discountApplied: { code: string; amount: number } | null = null;

  if (body.discountCode) {
    const result = applyDiscountCode(body.discountCode, subtotal);
    if (!result) {
      return NextResponse.json(
        { error: `Invalid discount code: ${body.discountCode}` },
        { status: 400 },
      );
    }
    orderTotal = result.discountedTotal;
    discountApplied = { code: result.code, amount: result.discountAmount };
  }

  const orderId = `ORD-${randomUUID()}`;
  const userKey = shopperKey(req);

  // Track checkout completion — the Metrics Author builds guarded-release
  // metrics on top of this event (error rate, latency, conversion).
  await track('checkout-completed', userKey, orderTotal, {
    orderId,
    subtotal,
    discountCode: discountApplied?.code ?? null,
    discountAmount: discountApplied?.amount ?? 0,
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
