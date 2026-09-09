import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_STEPS } from '../lib/live-sequence.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workspace = resolve(root, '.autofactory/local-execution');
mkdirSync(workspace, { recursive: true });
const config = {
  version: 1,
  kind: 'local-deployment',
  repo: 'gyeutter-launchdarkly/factory-ecom-example',
  workspace,
  steps: Object.fromEntries(
    LIVE_STEPS.map((step) => [
      step,
      {
        execute: [
          process.execPath,
          resolve(root, 'demo/local/adapter.mjs'),
          'execute',
          step,
        ],
        verify: [
          process.execPath,
          resolve(root, 'demo/local/adapter.mjs'),
          'verify',
          step,
        ],
        timeoutSeconds: 600,
      },
    ]),
  ),
};
writeFileSync(
  resolve(root, '.autofactory/live-config.json'),
  JSON.stringify(config, null, 2),
);
const settings = resolve(root, '.autofactory/demo-settings');
let text = '';
try {
  text = readFileSync(settings, 'utf8');
} catch {}
for (const [key, value] of [
  ['RUNNER', 'local'],
  ['PR_STRATEGY', 'new'],
]) {
  text =
    text
      .split('\n')
      .filter((line) => !line.startsWith(key + '='))
      .join('\n')
      .trim() +
    '\n' +
    key +
    '=' +
    value +
    '\n';
}
writeFileSync(settings, text);
console.log('Local adapters configured. Run: npm run demo:local');
