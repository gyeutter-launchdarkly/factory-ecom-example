import { NextRequest, NextResponse } from 'next/server';
import { boolVariation } from '@/lib/ld';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'key required' }, { status: 400 });
  }

  // Evaluate the flag with an anonymous user context (or use a session user key if available)
  const enabled = await boolVariation(key, 'anonymous', false);

  return NextResponse.json({ enabled, key });
}
