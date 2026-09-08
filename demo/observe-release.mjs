#!/usr/bin/env node
/** Read-only by default. --notify sends the verified deploy to the existing Beacon.
 * Requires an explicit release id: never attach an older rollout to a new PR.
 * The beta LD read adapter mirrors launchdarkly-auto-factory releaseAdapter.ts.
 */
import { execFileSync } from 'node:child_process';
import { runEvents } from './lib/run-events.mjs';
import { releaseState, verifyDeployment } from './lib/release-state.mjs';
const [scenario, repo, pr, run, ...options] = process.argv.slice(2);
if (
  !/^[a-z0-9-]+$/.test(scenario || '') ||
  !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo || '') ||
  !/^\d+$/.test(pr || '') ||
  !/^[\w-]+$/.test(run || '')
) {
  throw new Error(
    'usage: node --env-file=.env.local demo/observe-release.mjs <scenario> <owner/repo> <pr> <run-id> [--notify]',
  );
}
const { emit } = runEvents(scenario, run);
const env = { ...process.env };
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;
const gh = (path) =>
  JSON.parse(
    execFileSync('gh', ['api', path], {
      env,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
const {
  FACTORY_STORE_URL: store,
  FACTORY_RELEASE_FLAG: flag,
  FACTORY_RELEASE_ID: configuredReleaseId,
  LD_API_KEY: apiKey,
  LD_APP_PROJECT_KEY: project,
  BEACON_URL: beacon,
  BEACON_WEBHOOK_SECRET: secret,
} = process.env;
const environment = process.env.LD_ENVIRONMENT_KEY || 'production';
const service = process.env.FACTORY_SERVICE || 'checkout-demo';
const ldBase = process.env.LD_BASE_URL || 'https://app.launchdarkly.com';
const enc = encodeURIComponent;
async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Observation request failed (HTTP ${response.status}). Check the configured service and account access.`,
    );
  return response.json();
}
async function ld(path) {
  return json(`${ldBase}${path}`, {
    headers: { Authorization: apiKey, 'LD-API-Version': 'beta' },
  });
}
function node(key, status, tags = {}) {
  emit({ t: 'node', key, status, tags });
}
const delay = () =>
  new Promise((resolve) =>
    setTimeout(resolve, Number(process.env.FACTORY_POLL_MS) || 10000),
  );
let complete = false;
let releaseId = configuredReleaseId;
try {
  if (
    !store ||
    !flag ||
    !apiKey ||
    !project ||
    (!releaseId && !options.includes('--notify'))
  )
    throw new Error(
      'Release observation needs FACTORY_STORE_URL, FACTORY_RELEASE_FLAG, FACTORY_RELEASE_ID, LD_API_KEY, and LD_APP_PROJECT_KEY.',
    );
  if (options.some((option) => option !== '--notify'))
    throw new Error('Unknown release option');
  if (options.includes('--notify') && (!beacon || !secret))
    throw new Error('--notify needs BEACON_URL and BEACON_WEBHOOK_SECRET');
  emit({ t: 'run-resume' });
  emit({ t: 'repo', repo });
  emit({ t: 'pr', number: Number(pr) });
  const deadline =
    Date.now() +
    (Number(process.env.FACTORY_RELEASE_TIMEOUT_SECS) || 900) * 1000;
  let sha,
    notified = false,
    membershipVerified = false,
    deploymentVerified = false;
  let previousReleaseIds = new Set();
  while (Date.now() < deadline) {
    emit({ t: 'heartbeat' });
    if (!sha) {
      const pull = gh(`repos/${repo}/pulls/${pr}`);
      if (!pull.merged) {
        if (pull.state === 'closed')
          throw new Error('PR closed without merging');
        node('ext-merge', 'pending');
        await delay();
        continue;
      }
      sha = pull.merge_commit_sha;
      node('ext-merge', 'done', { deployed_sha: sha });
      emit({
        t: 'resource',
        kind: 'commits',
        key: sha,
        url: `https://github.com/${repo}/commit/${sha}`,
        station: 'ext-merge',
        label: 'Merged change',
      });
    }
    const statusUrl = new URL('/api/status', store).href;
    const deployment = await json(statusUrl);
    deploymentVerified = verifyDeployment(deployment, sha, service);
    if (!deploymentVerified) {
      node('ext-deploy', 'pending');
      await delay();
      continue;
    }
    node('ext-deploy', 'done', { deployed_sha: sha });
    emit({
      t: 'resource',
      kind: 'run',
      key: sha,
      url: statusUrl,
      station: 'ext-deploy',
      label: 'Verified deployed SHA',
    });
    if (options.includes('--notify') && !notified) {
      const before = await ld(
        `/internal/projects/${enc(project)}/flags/${enc(flag)}/automated-releases?filter=${enc(`environmentKey:${environment}`)}&limit=100`,
      );
      previousReleaseIds = new Set((before.items ?? []).map((item) => item.id));
      const result = await json(new URL('/flag-releases', beacon).href, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-beacon-secret': secret,
        },
        body: JSON.stringify({ service, sha, environment }),
      });
      const outcome = result.outcomes?.find((item) => item.flag === flag);
      if (
        result.sha !== sha ||
        result.environment !== environment ||
        !outcome ||
        !['released', 'already_running'].includes(outcome.action)
      ) {
        throw new Error(
          'Beacon did not start the requested flag release. Inspect the deployment handoff.',
        );
      }
      if (!releaseId && outcome.action === 'already_running')
        releaseId = outcome.detail?.releaseId;
      notified = true;
      node('af-beacon', 'done', { flag_key: flag });
    }
    if (!membershipVerified) {
      const filter = enc(`environmentKey:${environment}`);
      const releases = await ld(
        `/internal/projects/${enc(project)}/flags/${enc(flag)}/automated-releases?filter=${filter}&limit=100`,
      );
      if (!releaseId) {
        const candidates = (releases.items ?? []).filter(
          (item) => !previousReleaseIds.has(item.id) && item.kind === 'guarded',
        );
        if (candidates.length > 1)
          throw new Error(
            'Multiple new guarded releases found; specify FACTORY_RELEASE_ID',
          );
        if (!candidates.length) {
          await delay();
          continue;
        }
        releaseId = candidates[0].id;
      }
      if (!releases.items?.some((item) => item.id === releaseId))
        throw new Error(
          'Release id was not found for the configured flag and environment; refusing to attach unrelated evidence.',
        );
      membershipVerified = true;
    }
    const release = await ld(
      `/internal/projects/${enc(project)}/environments/${enc(environment)}/automated-releases/${enc(releaseId)}`,
    );
    if (release.id !== releaseId)
      throw new Error('Release API returned a different release id');
    const state = releaseState(release);
    // The selected id must have started after this PR merged. An older completed
    // rollout on the same flag is not evidence that this change was released.
    const startedAt = release.stages
      ?.map((stage) => stage.startedAtMillis)
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    const pull = gh(`repos/${repo}/pulls/${pr}`);
    if (!startedAt || startedAt < Date.parse(pull.merged_at))
      throw new Error(
        'Release start cannot be correlated with this merged change',
      );
    node('ld-guarded-release', state, {
      flag_key: flag,
      release_id: releaseId,
      release_status: release.status,
    });
    const url = `https://app.launchdarkly.com/projects/${enc(project)}/flags/${enc(flag)}/targeting?env=${enc(environment)}`;
    emit({
      t: 'resource',
      kind: 'flag',
      key: flag,
      url,
      station: 'ld-guarded-release',
      label: 'Guarded rollout',
    });
    node('ld-outcome', state, { release_status: release.status });
    if (state === 'failed')
      throw new Error(`Release ${release.status}; production rollout stopped`);
    if (state === 'done' && deploymentVerified) {
      complete = true;
      break;
    }
    await delay();
  }
  if (!complete)
    throw new Error(
      'Release observation timed out. The rollout may still be running; no completion was inferred.',
    );
  emit({
    t: 'note',
    level: 'info',
    text: 'Deployed SHA and guarded rollout completion verified. Cleanup remains a separate reviewed change.',
  });
} catch (error) {
  emit({ t: 'note', level: 'error', text: error.message });
  console.error(error.message);
  process.exitCode = 1;
} finally {
  emit({ t: 'run-done' });
}
