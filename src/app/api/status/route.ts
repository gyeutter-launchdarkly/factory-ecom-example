import { NextResponse } from 'next/server';

// Phase 2 beacon contract: returns the deployed commit SHA so Beacon can
// diff .release-flags/ manifests between deploys and start guarded releases.
export async function GET() {
  return NextResponse.json({
    service: 'checkout-demo',
    version: process.env.DEPLOY_SHA ?? 'dev',
    ok: true,
  });
}
