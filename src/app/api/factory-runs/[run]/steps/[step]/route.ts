import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { NextResponse } from 'next/server';
import { JOURNEY_STEPS } from '@/lib/journey';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  { params }: { params: { run: string; step: string } },
) {
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(params.run) ||
    !JOURNEY_STEPS.some((step) => step.key === params.step)
  )
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const root = await realpath(resolve('.autofactory/live-runs'));
    const path = await realpath(
      resolve(root, params.run, `${params.step}.json`),
    );
    if (!path.startsWith(`${root}${sep}`))
      throw new Error('Outside run directory');
    const receipt = JSON.parse(await readFile(path, 'utf8'));
    return NextResponse.json(receipt, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
