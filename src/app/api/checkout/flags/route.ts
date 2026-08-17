import { NextRequest, NextResponse } from 'next/server';
import { stringVariation } from '@/lib/ld';

interface CheckoutFlags {
  enableDiscountCodes: boolean;
}

export async function GET(req: NextRequest) {
  // Get the user key from query parameter or default to 'anonymous'
  const userKey = req.nextUrl.searchParams.get('userKey') || 'anonymous';

  // Feature flag: enable-discount-codes
  // Controls whether the discount code input section is shown on checkout form.
  const enableDiscountCodes = await stringVariation('enable-discount-codes', userKey, 'control') === 'v1';

  const flags: CheckoutFlags = {
    enableDiscountCodes,
  };

  return NextResponse.json({ flags });
}
