#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [file, scenario, speedArg = '8'] = process.argv.slice(2);
const speed = Math.max(1, Number(speedArg) || 8);
const out = resolve(process.env.FACTORY_PROGRESS_FILE || '.autofactory/runs.ndjson');
const source = (await readFile(resolve(file), 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

if (source.length === 0) throw new Error(`recording is empty: ${file}`);

const run = `${scenario}-recorded-${Date.now()}`;
const firstAt = Number(source[0].at) || Date.now();
let previousAt = firstAt;
let seq = 0;

for (const original of source) {
  const sourceAt = Number(original.at) || previousAt;
  const delay = Math.min(2000, Math.max(0, (sourceAt - previousAt) / speed));
  if (delay) await new Promise((done) => setTimeout(done, delay));
  previousAt = sourceAt;

  const event = {
    ...original,
    run,
    scenario,
    seq: ++seq,
    at: Date.now(),
  };
  await appendFile(out, `${JSON.stringify(event)}\n`);

  if (event.t === 'run-start') {
    await appendFile(
      out,
      `${JSON.stringify({
        run,
        scenario,
        seq: ++seq,
        at: Date.now(),
        t: 'note',
        level: 'info',
        text: 'Recorded real run — replay only; no agents or GitHub workflow are running now.',
      })}\n`,
    );
  }
}
