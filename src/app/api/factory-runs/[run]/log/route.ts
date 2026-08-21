import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { NextResponse } from 'next/server';
import { safeRunId } from '@/lib/local-run-log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROOT = resolve('.autofactory/local-runs');

/**
 * A browser-safe view of a local run's full output.
 *
 * Local mode has no GitHub Actions page to link to. This route exposes exactly
 * one known filename beneath one validated run directory, and verifies the
 * resolved real path as well, so a branch cannot smuggle a symlink out of the
 * ignored run tree.
 */
export async function GET(
  _request: Request,
  { params }: { params: { run: string } },
) {
  let run: string;
  try {
    run = decodeURIComponent(params.run);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!safeRunId(run)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const root = await realpath(ROOT);
    const candidate = await realpath(resolve(root, run, 'factory-run.log'));
    if (!candidate.startsWith(`${root}${sep}`)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const body = await readFile(candidate, 'utf8');
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="${run}.log"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}

