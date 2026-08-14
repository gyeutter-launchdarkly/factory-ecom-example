'use server';

import { boolVariation } from '@/lib/ld';

export async function getCheckoutFlags(userKey: string) {
  const discountCodesEnabled = await boolVariation('enable-discount-codes', userKey, false);
  return { discountCodesEnabled };
}
