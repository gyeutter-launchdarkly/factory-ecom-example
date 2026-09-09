import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const LIVE_STEPS = [
  'write-plan',
  'write-design',
  'write-code',
  'write-review',
  'write-validate',
  'release-classify',
  'release-flag',
  'release-instrument',
  'release-guard',
  'release-cleanup',
  'production',
];
export function validateLiveConfig(config) {
  if (
    config?.version !== 1 ||
    typeof config.workspace !== 'string' ||
    !config.workspace.trim() ||
    !/^[\w.-]+\/[\w.-]+$/.test(config.repo || '')
  )
    throw new Error(
      'Live configuration needs version 1, workspace, and owner/repo.',
    );
  for (const key of LIVE_STEPS) {
    const step = config.steps?.[key];
    for (const field of ['execute', 'verify']) {
      if (
        !Array.isArray(step?.[field]) ||
        !step[field].length ||
        step[field].some((v) => typeof v !== 'string' || !v.length)
      )
        throw new Error(`${key} needs an ${field} command argument array.`);
    }
    if (JSON.stringify(step.execute) === JSON.stringify(step.verify))
      throw new Error(`${key} needs a separate verification command.`);
    if (
      !Number.isInteger(step.timeoutSeconds) ||
      step.timeoutSeconds < 1 ||
      step.timeoutSeconds > 7200
    )
      throw new Error(`${key} needs timeoutSeconds between 1 and 7200.`);
  }
  return config;
}
export async function loadLiveConfig(path) {
  if (!path)
    throw new Error(
      'Set FACTORY_LIVE_CONFIG to a configuration with execution and verification adapters for all eleven steps.',
    );
  return validateLiveConfig(JSON.parse(await readFile(resolve(path), 'utf8')));
}

// No shell interpolation and no commands from browser requests. A host-owned
// configuration defines the adapters. Kill the process group on cancellation.
export function command(args, { cwd, env, timeoutSeconds, signal }) {
  return new Promise((accept, reject) => {
    let output = '',
      settled = false;
    const child = spawn(args[0], args.slice(1), {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const kill = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) {
        kill();
        reject(error);
      } else accept(output);
    };
    const abort = () =>
      finish(new Error('Live run cancelled; later steps were not started.'));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'Step command timed out; inspect the external operation before retrying.',
          ),
        ),
      timeoutSeconds * 1000,
    );
    child.stdout.on('data', (data) => {
      output += data;
      if (output.length > 1024 * 1024)
        finish(new Error('Step output exceeded 1 MB.'));
    });
    // Do not copy arbitrary command output (which may contain secrets) to SSE.
    child.stderr.resume();
    child.on('error', () =>
      finish(new Error('Could not start the configured step command.')),
    );
    child.on('close', (code) =>
      finish(
        code === 0
          ? null
          : new Error(`Step command exited ${code}. Inspect the adapter logs.`),
      ),
    );
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
export function verifiedReceipt(raw, run, step) {
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error('Verifier did not return valid JSON.');
  }
  if (
    result.ok !== true ||
    result.run !== run ||
    result.step !== step ||
    typeof result.revision !== 'string' ||
    !/^[a-f0-9]{40}$/.test(result.revision) ||
    !Array.isArray(result.artifacts) ||
    !result.artifacts.length
  )
    throw new Error(
      'Verification must return ok, the current run and step, a full git revision, and artifact links.',
    );
  for (const artifact of result.artifacts) {
    const url = new URL(artifact.url);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      typeof artifact.label !== 'string' ||
      !artifact.label.trim()
    )
      throw new Error('Verification returned an invalid artifact link.');
  }
  return {
    ok: true,
    run,
    step,
    revision: result.revision,
    artifacts: result.artifacts.map(({ url, label }) => ({ url, label })),
  };
}
export async function executeSequence({
  config,
  run,
  scenario,
  mode,
  emit,
  root,
  signal,
  invoke = command,
}) {
  validateLiveConfig(config); // All adapters must exist before the first mutation.
  await mkdir(root, { recursive: true });
  if ((await readdir(root)).length)
    throw new Error(
      'Run receipt directory already exists; refusing to repeat side effects.',
    );
  await writeFile(
    resolve(root, 'started.json'),
    JSON.stringify({ run, scenario, mode, at: Date.now() }),
    { flag: 'wx' },
  );
  emit({ t: 'run-start' });
  emit({ t: 'mode', mode });
  emit({ t: 'repo', repo: config.repo });
  emit({ t: 'node', key: 'live-sequence-v1', status: 'done' });
  let active;
  const receipts = [];
  try {
    for (const key of LIVE_STEPS) {
      active = key;
      if (signal?.aborted) throw new Error('Run cancelled.');
      emit({ t: 'node', key, status: 'running' });
      const step = config.steps[key];
      const env = {
        ...process.env,
        FACTORY_RUN_ID: run,
        FACTORY_SCENARIO: scenario,
        FACTORY_STEP: key,
        FACTORY_EXECUTION_MODE: mode,
        FACTORY_RECEIPTS_DIR: resolve(root),
      };
      // Child adapters cannot write directly to the presentation stream.
      delete env.FACTORY_PROGRESS_FILE;
      const options = {
        cwd: resolve(config.workspace),
        env,
        timeoutSeconds: step.timeoutSeconds,
        signal,
      };
      await invoke(step.execute, options);
      emit({
        t: 'log',
        text: `${key}: execution finished; verifying its result.`,
      });
      const receipt = verifiedReceipt(
        await invoke(step.verify, options),
        run,
        key,
      );
      const unchanged = [
        'write-review',
        'write-validate',
        'release-classify',
        'production',
      ].includes(key);
      if (unchanged && receipts.at(-1)?.revision !== receipt.revision)
        throw new Error(
          `${key} verified a different revision from its prerequisite.`,
        );
      await writeFile(
        resolve(root, `${key}.json`),
        JSON.stringify(receipt, null, 2),
        { flag: 'wx' },
      );
      receipts.push(receipt);
      emit({
        t: 'resource',
        kind: 'run',
        key: `${key}:receipt`,
        station: key,
        url: `/api/factory-runs/${encodeURIComponent(run)}/steps/${key}`,
        label: 'Verification receipt',
      });
      for (const { url, label } of receipt.artifacts)
        emit({
          t: 'resource',
          kind: 'run',
          key: `${key}:${url}`,
          station: key,
          url,
          label,
        });
      emit({
        t: 'node',
        key,
        status: 'done',
        tags: { verified_revision: receipt.revision },
      });
    }
    emit({
      t: 'note',
      level: 'info',
      text: 'All eleven steps executed and independently verified in order.',
    });
    return receipts;
  } catch (error) {
    if (active) emit({ t: 'node', key: active, status: 'failed' });
    emit({ t: 'note', level: 'error', text: error.message });
    throw error;
  } finally {
    emit({ t: 'run-done' });
  }
}
