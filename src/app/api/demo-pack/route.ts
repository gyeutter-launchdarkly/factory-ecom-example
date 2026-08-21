import { NextResponse } from 'next/server';
import { demoPack } from '@/lib/demo-pack';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await demoPack());
}
