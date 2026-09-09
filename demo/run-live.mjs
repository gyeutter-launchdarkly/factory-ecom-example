#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { runEvents } from './lib/run-events.mjs';
import { loadLiveConfig, executeSequence } from './lib/live-sequence.mjs';
const [scenario, mode = 'hosted'] = process.argv.slice(2);
if (
  !/^[a-z0-9-]{1,64}$/.test(scenario || '') ||
  !['factory', 'hosted', 'local'].includes(mode)
)
  throw new Error(
    'Usage: node demo/run-live.mjs <scenario> <factory|hosted|local>',
  );
const envFile = process.env.FACTORY_ENV_FILE || '.env.local';
if (existsSync(envFile)) process.loadEnvFile(envFile);
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());
const lock = resolve('.autofactory/live-run.lock');
let locked = false;
try {
  const config = await loadLiveConfig(
    process.env.FACTORY_LIVE_CONFIG ||
      (existsSync('.autofactory/live-config.json')
        ? '.autofactory/live-config.json'
        : undefined),
  );
  if (
    config.kind === 'local-deployment' &&
    (mode !== 'local' || scenario !== 'local-catalog-sort')
  )
    throw new Error(
      'Choose Local mode and the local-catalog-sort scenario for the configured local deployment.',
    );
  await mkdir(resolve('.autofactory'), { recursive: true });
  await mkdir(lock);
  locked = true;
  const run = `${scenario}-live-${randomUUID()}`;
  const { emit } = runEvents(scenario, run);
  await executeSequence({
    config,
    run,
    scenario,
    mode,
    emit,
    root: resolve('.autofactory/live-runs', run),
    signal: abort.signal,
  });
} catch (error) {
  console.error(
    error.code === 'EEXIST'
      ? 'A live run is already active. Inspect it before retrying.'
      : error.message,
  );
  process.exitCode = 1;
} finally {
  if (locked) await rm(lock, { recursive: true });
}
