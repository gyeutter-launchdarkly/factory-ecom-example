import { NextRequest, NextResponse } from 'next/server';
import { shopperKey } from '@/lib/shopper';
import { stringVariation } from '@/lib/ld';

export async function GET(req: NextRequest) {
  const userKey = shopperKey(req);
  const variant = await stringVariation('enable-discount-codes', userKey, 'control');
  
  return NextResponse.json({
    enabled: variant === 'v1',
  });
}
