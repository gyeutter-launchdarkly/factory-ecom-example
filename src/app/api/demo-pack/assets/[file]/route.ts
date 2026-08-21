import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { demoPack, packAssetPath } from '@/lib/demo-pack';

// Pack artwork lives in the ignored .autofactory tree, not public/, so that a
// customer's logo and photography never enter the repository. The container
// mounts that tree read-only, so this route is the only way to read it.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

export async function GET(
  request: Request,
  { params }: { params: { file: string } },
) {
  const file = decodeURIComponent(params.file);
  const requested = new URL(request.url).searchParams.get('pack');
  // Only the selected pack's assets are served: the pack id in the URL is a
  // cache-buster for switching stores, never a way to read another pack.
  const pack = await demoPack();
  if (requested && requested !== pack.id) {
    return NextResponse.json({ error: 'pack is not selected' }, { status: 404 });
  }

  const path = packAssetPath(pack.id, file);
  const type = TYPES[file.split('.').pop()?.toLowerCase() ?? ''];
  if (!path || !type) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const body = await readFile(path);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': type,
        // The operator can drop in new artwork mid-demo; a cached response
        // would keep showing the old store after a pack switch.
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
