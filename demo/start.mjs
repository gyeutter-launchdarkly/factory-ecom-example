#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const production = args.includes('--production');
const position = args.indexOf('--port');
const port = Number(
  position < 0 ? process.env.PORT || 3108 : args[position + 1],
);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Use --port with a number from 1024 to 65535.');
if (Number(process.versions.node.split('.')[0]) < 22)
  throw new Error('This demo needs Node.js 22 or later.');
const envFile = process.env.FACTORY_ENV_FILE || '.env.local';
if (existsSync(envFile)) process.loadEnvFile(envFile);
// Refuse an occupied port before starting any background worker.
await new Promise((resolvePort, reject) => {
  const probe = createServer();
  probe.once('error', () =>
    reject(
      new Error(
        `Port ${port} is in use. Stop that preview or choose another --port.`,
      ),
    ),
  );
  probe.listen(port, '127.0.0.1', () => probe.close(resolvePort));
});
console.log(`Demo: http://127.0.0.1:${port}`);
execFileSync(process.execPath, ['demo/doctor.mjs'], { stdio: 'inherit' });
let existingController = false;
try {
  const heartbeat = JSON.parse(
    readFileSync(
      resolve(
        process.env.FACTORY_CONTROL_DIR || '.autofactory/control',
        'watcher.json',
      ),
      'utf8',
    ),
  );
  if (Date.now() - heartbeat.at < 15000 && heartbeat.pid > 0) {
    process.kill(heartbeat.pid, 0);
    existingController = true;
  }
} catch {}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  const killTimer = setTimeout(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }
    process.exit(code);
  }, 3000);
  Promise.all(
    children.map((child) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise((done) => child.once('exit', done)),
    ),
  ).then(() => {
    clearTimeout(killTimer);
    process.exit(code);
  });
}
function start(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    detached: true,
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
if (existingController) console.log('Using the existing demo controller.');
else start('bash', ['demo/lib/control-watch.sh']);
start(process.execPath, [
  'node_modules/next/dist/bin/next',
  production ? 'start' : 'dev',
  '--hostname',
  '127.0.0.1',
  '--port',
  String(port),
]);
