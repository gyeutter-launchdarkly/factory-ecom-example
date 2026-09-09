#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLiveConfig } from './lib/live-sequence.mjs';
import { readiness } from './lib/readiness.mjs';
if (Number(process.versions.node.split('.')[0]) < 22)
  throw new Error('This demo needs Node.js 22 or later.');
const envFile = process.env.FACTORY_ENV_FILE || '.env.local';
if (existsSync(envFile)) process.loadEnvFile(envFile);
const has = (command) => {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const tools = Object.fromEntries(
  ['bash', 'jq', 'git', 'gh'].map((command) => [command, has(command)]),
);
tools.node = Number(process.versions.node.split('.')[0]) >= 22;
const githubEnv = { ...process.env };
delete githubEnv.GH_TOKEN;
delete githubEnv.GITHUB_TOKEN;
try {
  execFileSync('gh', ['auth', 'status'], {
    env: githubEnv,
    stdio: 'ignore',
    timeout: 10000,
  });
  tools.github = true;
} catch {
  tools.github = false;
}
tools.cli = [
  process.env.AUTOFACTORY_DIR,
  '../launchdarkly-auto-factory',
  `${process.env.HOME}/Documents/launchdarkly-auto-factory`,
]
  .filter(Boolean)
  .some((dir) => existsSync(resolve(dir, 'packages/phase1-cli/dist/cli.js')));
try {
  const config = await loadLiveConfig(process.env.FACTORY_LIVE_CONFIG);
  tools.liveSequence = existsSync(resolve(config.workspace));
} catch {
  tools.liveSequence = false;
}
const report = readiness(process.env, tools);
if (process.argv.includes('--json')) console.log(JSON.stringify(report));
else {
  console.log('Demo readiness');
  for (const [name, mode] of Object.entries({
    ...report.modes,
    release: report.release,
  }))
    console.log(
      `${mode.ready ? '✓' : '–'} ${name}: ${mode.ready ? 'prerequisites present' : mode.missing.join(', ')}`,
    );
  console.log(report.note);
}
