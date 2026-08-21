import { NextResponse } from 'next/server';
import { demoProfile, PROFILE_SCENARIOS } from '@/lib/demo-profile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const profile = await demoProfile();
  return NextResponse.json({
    profile,
    scenarios: PROFILE_SCENARIOS[profile],
  });
}
