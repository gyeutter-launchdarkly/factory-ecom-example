import { NextRequest, NextResponse } from 'next/server';
import { resolveProduct } from '@/lib/catalog';
import { calculateOrderTotal, formatPrice } from '@/lib/pricing';
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
    const product = await resolveProduct(line.productId);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product: ${line.productId}` },
        { status: 400 },
      );
    }
    items.push({ product, quantity: line.quantity });
  }

  const orderTotal = calculateOrderTotal(items);
  const orderId = `ORD-${Date.now()}`;
  const userKey = body.customer.email || 'anonymous';

  // Track checkout completion — the Metrics Author builds guarded-release
  // metrics on top of this event (error rate, latency, conversion).
  await track('checkout-completed', userKey, orderTotal, {
    orderId,
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
