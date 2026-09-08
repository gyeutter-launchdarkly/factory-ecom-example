import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function runEvents(
  scenario,
  run = process.env.FACTORY_RUN_ID || `${scenario}-${Date.now()}`,
) {
  const path = resolve(
    process.env.FACTORY_PROGRESS_FILE || '.autofactory/runs.ndjson',
  );
  mkdirSync(dirname(path), { recursive: true });
  let seq = 0;
  return {
    run,
    emit(event) {
      appendFileSync(
        path,
        JSON.stringify({
          run,
          scenario,
          at: Date.now(),
          seq: seq++,
          ...event,
        }) + '\n',
      );
    },
  };
}
