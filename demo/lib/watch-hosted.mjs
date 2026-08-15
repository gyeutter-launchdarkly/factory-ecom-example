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
 * Usage: node demo/lib/watch-hosted.mjs <scenario> <pr> <runId> <repoSlug> <ldProject> [ldEnv]
 */

const [, , scenario, pr, runId, slug, ldProject, ldEnvArg] = process.argv;
if (!scenario || !pr || !runId || !slug || !ldProject) {
  console.error('usage: watch-hosted.mjs <scenario> <pr> <runId> <slug> <ldProject> [ldEnv]');
  process.exit(2);
}

const GH_TOKEN = process.env.GH_WATCH_TOKEN || '';
const LD_KEY = process.env.LD_API_KEY || '';
const LD_ENV = ldEnvArg || process.env.LD_ENVIRONMENT_KEY || 'production';
// The model each node actually used is only in the job log, which GitHub will
// not serve until the run ends. This is what the graph is configured with; set
// FACTORY_MODEL when you have retuned the chain, or the pane will misreport it.
const MODEL = process.env.FACTORY_MODEL || 'claude-haiku-4-5-20251001';
const POLL_MS = 5000;
// A slow agent can go minutes without producing an artifact. Without a sign of
// life the pane declares the run stalled, so say so on a fixed cadence.
const HEARTBEAT_MS = 30_000;

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

// Commit SHA -> the files it touched, so a commit is inspected once.
const commitFiles = new Map();

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

// Deep links follow the environment the demo is configured for; hardcoding
// /production sent the pane to a 404 on any other environment.
function flagUrl(key) {
  return `https://app.launchdarkly.com/projects/${ldProject}/flags/${key}/targeting?env=${LD_ENV}`;
}

function metricUrl(key) {
  return `https://app.launchdarkly.com/projects/${ldProject}/metrics/${key}?env=${LD_ENV}`;
}

// The flag the factory creates is named after the feature, e.g.
// enable-express-checkout. Match on the scenario rather than an exact key, since
// the agent chooses the final name.
function matchesScenario(key) {
  const stem = scenario.replace(/-/g, '');
  return key.replace(/-/g, '').includes(stem);
}

/** Files a commit touched. Its message alone is too unreliable to route on. */
async function filesOf(sha) {
  if (commitFiles.has(sha)) return commitFiles.get(sha);
  const c = await gh(`/commits/${sha}`);
  const files = (c?.files ?? []).map((f) => f.filename ?? '').filter(Boolean);
  commitFiles.set(sha, files);
  return files;
}

async function snapshot() {
  const flags = await ld(`/flags/${ldProject}?filter=tags:auto-factory&limit=50`);
  for (const f of flags?.items ?? []) baseline.flags.add(f.key);
  const metrics = await ld(`/metrics/${ldProject}?limit=100`);
  for (const m of metrics?.items ?? []) baseline.metrics.add(m.key);
  const commits = await gh(`/pulls/${pr}/commits?per_page=100`);
  for (const c of commits ?? []) baseline.commits.add(c.sha);
}

async function tick() {
  // Flag + metrics, straight from LaunchDarkly. The factory tags what it
  // creates 'auto-factory' (and 'auto-generated'); the demo filters on the
  // former everywhere, so reset, the view and this watcher agree on one word.
  const flags = await ld(`/flags/${ldProject}?filter=tags:auto-factory&limit=50`);
  const flag = flags?.items?.find((f) => matchesScenario(f.key) && !baseline.flags.has(f.key));
  if (flag) {
    finish('autofactory-flag-implementer', { flag_key: flag.key, flag_ready: 'true' });
    if (!announced.has('flag')) {
      announced.add('flag');
      say(`Flag: ${flag.key} → ${flagUrl(flag.key)}`);
    }
  }

  const metrics = await ld(`/metrics/${ldProject}?limit=100`);
  const mine = (metrics?.items ?? []).filter((m) => matchesScenario(m.key) && !baseline.metrics.has(m.key));
  if (mine.length) {
    finish('autofactory-metrics-author', { metric_keys: mine.map((m) => m.key).join(',') });
    for (const m of mine) {
      if (announced.has(`m:${m.key}`)) continue;
      announced.add(`m:${m.key}`);
      say(`Metric: ${m.key} → ${metricUrl(m.key)}`);
    }
  }

  // Commits the agents push while the run is going. Routed on the files they
  // touch: agents word their commit messages however they like, and a run whose
  // steps never light up looks broken even when it is working.
  const commits = await gh(`/pulls/${pr}/commits?per_page=100`);
  for (const c of commits ?? []) {
    if (baseline.commits.has(c.sha)) continue;
    const files = await filesOf(c.sha);
    const haystack = [c.commit?.message ?? '', ...files].join('\n').toLowerCase();

    const manifest = files.find((f) => f.includes('.release-flags/'));
    if (manifest || /release-flags/.test(haystack)) {
      finish('autofactory-manifest-steward', manifest ? { manifest_path: manifest } : {});
    }
    if (files.some((f) => /\.(test|spec)\./.test(f)) || /\btests?\b|\bspec\b/.test(haystack)) {
      finish('autofactory-flag-testing', { tests_last_run: 'pass' });
    }
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
let lastBeat = 0;
while (!conclusion && Date.now() < deadline) {
  conclusion = await tick();
  if (Date.now() - lastBeat >= HEARTBEAT_MS) {
    lastBeat = Date.now();
    say('[heartbeat]');
  }
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
