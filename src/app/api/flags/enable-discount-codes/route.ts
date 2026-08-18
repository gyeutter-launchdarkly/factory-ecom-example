import { NextRequest, NextResponse } from 'next/server';
import { boolVariation } from '@/lib/ld';

export async function POST(req: NextRequest) {
  try {
    const { userKey } = await req.json();
    const enableDiscountCodes = await boolVariation('enable-discount-codes', userKey || 'anonymous', false);
    return NextResponse.json({ enableDiscountCodes });
  } catch (err) {
    // Gracefully fall back to false if evaluation fails
    return NextResponse.json({ enableDiscountCodes: false });
  }
}
