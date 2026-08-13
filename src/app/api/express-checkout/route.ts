import { NextRequest, NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { calculatePrice, formatPrice } from '@/lib/pricing';
import { track, stringVariation } from '@/lib/ld';

// Express checkout: single-item, address-free order flow.
// Skips the full cart and shipping fields — reduces friction for impulse buys.
// The factory will gate this behind a feature flag so it can be rolled out
// progressively and monitored against checkout-completed rate and
// express-checkout-conversion rate independently of the main checkout funnel.

interface ExpressCheckoutBody {
  item: { productId: string; quantity: number };
  customer: {
    name: string;
    email: string;
  };
  payment: {
    cardNumber: string;
  };
}

export async function POST(req: NextRequest) {
  // Gate the entire endpoint behind the enable-express-checkout flag.
  // Returns 404 when flag is off (control) — guards against direct URL access
  // while the button is hidden on the frontend.
  const expressVariation = await stringVariation('enable-express-checkout', 'anonymous', 'control');
  if (expressVariation !== 'v1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: ExpressCheckoutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.item?.productId) {
    return NextResponse.json({ error: 'No item specified' }, { status: 400 });
  }

  const product = getProduct(body.item.productId);
  if (!product) {
    return NextResponse.json(
      { error: `Unknown product: ${body.item.productId}` },
      { status: 400 },
    );
  }

  const qty = body.item.quantity ?? 1;
  const unitPrice = calculatePrice(product);
  const orderTotal = unitPrice * qty;
  const orderId = `EXP-${Date.now()}`;
  const userKey = body.customer.email || 'anonymous';

  // Track as checkout-completed so guarded-release metrics stay consistent,
  // plus a separate express-checkout-conversion event for funnel analysis.
  await track('checkout-completed', userKey, orderTotal, { orderId, express: true });
  await track('express-checkout-conversion', userKey, 1);

  return NextResponse.json({
    orderId,
    orderTotal,
    orderTotalFormatted: formatPrice(orderTotal),
    customer: body.customer,
    item: {
      productId: product.id,
      name: product.name,
      quantity: qty,
      lineTotal: orderTotal,
    },
  });
}
