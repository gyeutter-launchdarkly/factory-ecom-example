import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const result = spawnSync(
  process.execPath,
  ['demo/run-live.mjs', 'local-catalog-sort', 'local'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      FACTORY_LIVE_CONFIG: resolve('.autofactory/live-config.json'),
    },
  },
);
process.exit(result.status ?? 1);
