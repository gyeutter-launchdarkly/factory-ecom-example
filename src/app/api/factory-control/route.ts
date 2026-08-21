import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { demoPack, scenarioBelongsToPack } from '@/lib/demo-pack';

// The pane's buttons. This route never runs a demo command: the app is a
// container with no repo, no gh and no LaunchDarkly key. It writes a request
// file into the one writable corner of the bind mount, and the host-side
// watcher (demo/lib/control-watch.sh) does the work and writes status back.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CONTROL_DIR = resolve(process.env.FACTORY_CONTROL_DIR ?? '.autofactory/control');
const REQ_DIR = join(CONTROL_DIR, 'requests');
const STATUS_DIR = join(CONTROL_DIR, 'status');

// Without a watcher the requests pile up unread, so the pane greys the buttons
// out instead of taking a click it cannot honour. The watcher beats once a
// second; this tolerates a slow poll without flickering.
const HEARTBEAT_MAX_AGE_MS = 15_000;

const ACTIONS = ['configure', 'reset', 'run', 'replay', 'clear-history'] as const;
type Action = (typeof ACTIONS)[number];

const isAction = (v: unknown): v is Action => ACTIONS.includes(v as Action);

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function watcherAlive(): Promise<boolean> {
  const beat = await readJson<{ at?: number }>(join(CONTROL_DIR, 'watcher.json'));
  return !!beat?.at && Date.now() - beat.at < HEARTBEAT_MAX_AGE_MS;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');

  if (id) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return NextResponse.json({ error: 'bad id' }, { status: 400 });
    }
    const status = await readJson<unknown>(join(STATUS_DIR, `${id}.json`));
    // No file yet means the watcher has not picked the request up.
    return NextResponse.json(status ?? { id, state: 'queued', message: 'Queued…' });
  }

  const beat = await readJson<{ at?: number; busy?: boolean }>(join(CONTROL_DIR, 'watcher.json'));
  const scenarios =
    (await readJson<{
      key: string;
      title: string;
      recorded?: boolean;
      story: { problem: string; goal: string; payoff: string };
    }[]>(
      join(CONTROL_DIR, 'scenarios.json'),
    )) ?? [];
  const runtime = await readJson<{
    mode: string;
    strategy: string;
    pack: string;
    packName: string;
    visibility: string;
  }>(join(CONTROL_DIR, 'runtime.json'));
  const packs =
    (await readJson<{ id: string; name: string; visibility: string }[]>(
      join(CONTROL_DIR, 'packs.json'),
    )) ?? [];
  const pack = await demoPack();

  return NextResponse.json({
    available: await watcherAlive(),
    busy: !!beat?.busy,
    pack,
    runtime,
    packs,
    scenarios: scenarios.filter((scenario) => scenarioBelongsToPack(scenario.key, pack)),
  });
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    scenario?: unknown;
    mode?: unknown;
    strategy?: unknown;
    pack?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  if (!isAction(body.action)) {
    return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
  }

  const scenario = typeof body.scenario === 'string' ? body.scenario : '';
  const needsScenario = body.action === 'run' || body.action === 'replay';
  if (needsScenario && !/^[a-z0-9-]{1,64}$/.test(scenario)) {
    return NextResponse.json({ error: 'bad scenario' }, { status: 400 });
  }
  if (needsScenario && !scenarioBelongsToPack(scenario, await demoPack())) {
    return NextResponse.json({ error: 'scenario is not available for this demo pack' }, { status: 400 });
  }
  if (body.action === 'configure') {
    if (
      typeof body.mode !== 'string' ||
      !['hosted', 'local', 'recorded', 'rehearsal'].includes(body.mode) ||
      typeof body.strategy !== 'string' ||
      !['new', 'attach'].includes(body.strategy) ||
      typeof body.pack !== 'string' ||
      !/^[a-z0-9-]{1,64}$/.test(body.pack)
    ) {
      return NextResponse.json({ error: 'bad demo settings' }, { status: 400 });
    }
  }

  // Refused rather than queued: a request nobody is listening for would sit
  // there until the next `make menu`, and a reset arriving then lands in
  // someone else's demo.
  if (!(await watcherAlive())) {
    return NextResponse.json(
      { error: 'no demo controller is running — start `make menu` on the host' },
      { status: 503 },
    );
  }

  const id = randomUUID();
  try {
    await mkdir(REQ_DIR, { recursive: true });
    // Written then renamed, so the watcher cannot read a half-written request.
    const tmp = join(REQ_DIR, `.${id}.tmp`);
    const payload = JSON.stringify({
      id,
      action: body.action,
      scenario,
      mode: body.mode,
      strategy: body.strategy,
      pack: body.pack,
      at: Date.now(),
    });
    await writeFile(tmp, `${payload}\n`, 'utf8');
    await rename(tmp, join(REQ_DIR, `${id}.json`));
  } catch {
    // Almost always the read-only mount: the control directory did not exist
    // when the container started, so compose bound nothing writable.
    return NextResponse.json(
      { error: 'control channel unavailable — restart the app with `make dev`' },
      { status: 503 },
    );
  }

  return NextResponse.json({ id, state: 'queued' });
}
