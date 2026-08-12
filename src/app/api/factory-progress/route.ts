import { NextResponse } from 'next/server';
import { open, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Tails the NDJSON file written by demo/lib/progress-tap.mjs and streams it to
// the in-app flowchart over SSE. Polling beats fs.watch here: the file is
// written from the host and read from inside a container through a bind mount,
// where inotify events are not reliably delivered.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FILE = resolve(process.env.FACTORY_PROGRESS_FILE ?? '.autofactory/runs.ndjson');
const POLL_MS = 400;

async function readFrom(offset: number): Promise<{ text: string; next: number }> {
  let handle;
  try {
    const info = await stat(FILE);
    // The log is append-only across runs, but rotates when it gets large.
    // A shrink means it rotated, so re-read from the start.
    if (info.size < offset) offset = 0;
    if (info.size === offset) return { text: '', next: offset };
    handle = await open(FILE, 'r');
    const len = info.size - offset;
    const buf = Buffer.alloc(len);
    await handle.read(buf, 0, len, offset);
    return { text: buf.toString('utf8'), next: info.size };
  } catch {
    // No file yet: no run has been started. Not an error.
    return { text: '', next: offset };
  } finally {
    await handle?.close();
  }
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let offset = 0;
  let carry = '';

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener('abort', close);

      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          close();
        }
      };

      const tick = async () => {
        if (closed) return;
        const { text, next } = await readFrom(offset);
        offset = next;
        if (!text) {
          send({ t: 'ping' });
          return;
        }
        carry += text;
        const lines = carry.split('\n');
        carry = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            send(JSON.parse(line));
          } catch {}
        }
      };

      const timer = setInterval(() => void tick(), POLL_MS);
      await tick();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
