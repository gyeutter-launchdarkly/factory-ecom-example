#!/usr/bin/env node
/**
 * Live progress for a hosted (GitHub Actions) factory run.
 *
 * GitHub does NOT serve a job's log while the job is running: the logs endpoint
 * answers 404 BlobNotFound until the job finishes. So progress cannot come from
 * the log. It comes from the artifacts each agent produces, which are all
 * observable live:
 *
 *   flag-implementer   the flag appears in LaunchDarkly
 *   metrics-author     its metrics appear in LaunchDarkly
 *   manifest-steward   a .release-flags/ commit is pushed to the PR branch
 *   flag-testing       a commit touching a test file is pushed
 *   code-reviewer      the run completes (its verdict is the run's conclusion)
 *   research-planner   no artifact of its own; it is first, so it is marked done
 *                      as soon as any later artifact shows up
 *
 * Output is lines in the same shape demo/lib/progress-tap.mjs already parses, so
 * there is one parser for both paths. Pipe this into the tap.
 *
 * Usage: node demo/lib/watch-hosted.mjs <scenario> <pr> <runId> <repoSlug> <ldProject>
 */

const [, , scenario, pr, runId, slug, ldProject] = process.argv;
if (!scenario || !pr || !runId || !slug || !ldProject) {
  console.error('usage: watch-hosted.mjs <scenario> <pr> <runId> <slug> <ldProject>');
  process.exit(2);
}

const GH_TOKEN = process.env.GH_WATCH_TOKEN || '';
const LD_KEY = process.env.LD_API_KEY || '';
const MODEL = process.env.FACTORY_MODEL || 'claude-haiku-4-5-20251001';
const POLL_MS = 5000;

const CHAIN = [
  'autofactory-research-planner',
  'autofactory-flag-implementer',
  'autofactory-metrics-author',
  'autofactory-manifest-steward',
  'autofactory-flag-testing',
  'autofactory-code-reviewer',
];

const done = new Set();
const started = new Set();
const announced = new Set();

// Artifacts from EARLIER runs must not count as this run's progress, or the pane
// jumps straight to done on a repeat demo. Snapshot what already exists first and
// only treat additions as signals.
const baseline = { flags: new Set(), metrics: new Set(), commits: new Set() };

function say(line) {
  process.stdout.write(line + '\n');
}

// Human-readable progress on stderr, so it reaches the terminal without landing
// in the tap's stdin. Redrawn in place with \r.
const BAR_WIDTH = 24;
function bar(label) {
  if (!process.stderr.isTTY) return;
  const filled = Math.round((done.size / CHAIN.length) * BAR_WIDTH);
  const track = '#'.repeat(filled) + '.'.repeat(BAR_WIDTH - filled);
  const pct = String(Math.round((done.size / CHAIN.length) * 100)).padStart(3);
  process.stderr.write(`\r  [${track}] ${pct}%  ${done.size}/${CHAIN.length}  ${label.padEnd(22)}`);
}

/** Mark a node running (once), which is what lights the step up in the pane. */
function start(key) {
  if (started.has(key) || done.has(key)) return;
  started.add(key);
  say(`[node] ${key} anthropic model → '${MODEL}'`);
}

function finish(key, tags = {}) {
  if (done.has(key)) return;
  start(key);
  done.add(key);
  const i = CHAIN.indexOf(key) + 1;
  say(`■ step ${i} done: ${key} (${key}) [ok] tags: ${JSON.stringify(tags)}`);
}

async function gh(path) {
  try {
    const r = await fetch(`https://api.github.com/repos/${slug}${path}`, {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function ld(path) {
  if (!LD_KEY) return null;
  try {
    const r = await fetch(`https://app.launchdarkly.com/api/v2${path}`, {
      headers: { Authorization: LD_KEY },
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// The flag the factory creates is named after the feature, e.g.
// enable-express-checkout. Match on the scenario rather than an exact key, since
// the agent chooses the final name.
function matchesScenario(key) {
  const stem = scenario.replace(/-/g, '');
  return key.replace(/-/g, '').includes(stem);
}

async function snapshot() {
  const flags = await ld(`/flags/${ldProject}?filter=tags:auto-generated&limit=50`);
  for (const f of flags?.items ?? []) baseline.flags.add(f.key);
  const metrics = await ld(`/metrics/${ldProject}?limit=100`);
  for (const m of metrics?.items ?? []) baseline.metrics.add(m.key);
  const commits = await gh(`/pulls/${pr}/commits?per_page=100`);
  for (const c of commits ?? []) baseline.commits.add(c.sha);
}

async function tick() {
  // Flag + metrics, straight from LaunchDarkly.
  const flags = await ld(`/flags/${ldProject}?filter=tags:auto-generated&limit=50`);
  const flag = flags?.items?.find((f) => matchesScenario(f.key) && !baseline.flags.has(f.key));
  if (flag) {
    finish('autofactory-flag-implementer', { flag_key: flag.key, flag_ready: 'true' });
    if (!announced.has('flag')) {
      announced.add('flag');
      say(`Flag: ${flag.key} → https://app.launchdarkly.com/${ldProject}/production/features/${flag.key}`);
    }
  }

  const metrics = await ld(`/metrics/${ldProject}?limit=100`);
  const mine = (metrics?.items ?? []).filter((m) => matchesScenario(m.key) && !baseline.metrics.has(m.key));
  if (mine.length) {
    finish('autofactory-metrics-author', { metric_keys: mine.map((m) => m.key).join(',') });
    for (const m of mine) {
      if (announced.has(`m:${m.key}`)) continue;
      announced.add(`m:${m.key}`);
      say(`Metric: ${m.key} → https://app.launchdarkly.com/${ldProject}/production/metrics/${m.key}`);
    }
  }

  // Commits the agents push while the run is going.
  const commits = await gh(`/pulls/${pr}/commits?per_page=100`);
  for (const c of commits ?? []) {
    if (baseline.commits.has(c.sha)) continue;
    const msg = c.commit?.message ?? '';
    const files = msg.toLowerCase();
    if (/release-flags/.test(files)) finish('autofactory-manifest-steward', { manifest: 'pr-' + pr });
    if (/test|spec/.test(files)) finish('autofactory-flag-testing', { tests_last_run: 'pass' });
  }

  // Anything landing at all means research & plan is behind us.
  if (done.size > 0) finish('autofactory-research-planner');

  // Light up whichever step is next, so the pane always shows something moving.
  const next = CHAIN.find((k) => !done.has(k));
  if (next) start(next);
  bar(next ? next.replace('autofactory-', '') : 'finishing');

  const run = await gh(`/actions/runs/${runId}`);
  return run?.status === 'completed' ? (run.conclusion ?? 'completed') : null;
}

await snapshot();

const deadline = Date.now() + 25 * 60 * 1000;
let conclusion = null;
while (!conclusion && Date.now() < deadline) {
  conclusion = await tick();
  if (!conclusion) await new Promise((r) => setTimeout(r, POLL_MS));
}

if (conclusion === 'success') {
  for (const k of CHAIN) finish(k);
  bar('done');
  process.stderr.write('\n');
  say('{"review_approved":true,"risk_level":"low"}');
} else if (conclusion) {
  process.stderr.write('\n');
  const stuck = CHAIN.find((k) => !done.has(k));
  if (stuck) say(`::error::AutoFactory: run ${conclusion} at ${stuck}`);
}
say(`Ran ${done.size} node(s): ${[...done].join(' → ')}`);
