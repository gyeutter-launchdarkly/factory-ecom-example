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

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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

// Audience titles match the pane (FactoryPane.tsx). Agent keys stay as the
// factory emits them; only the bar's label uses the short name.
const CHAIN = [
  'autofactory-research-planner',
  'autofactory-flag-implementer',
  'autofactory-metrics-author',
  'autofactory-manifest-steward',
  'autofactory-flag-testing',
  'autofactory-code-reviewer',
];
const TITLES = {
  'autofactory-research-planner': 'Plan',
  'autofactory-flag-implementer': 'Flag',
  'autofactory-metrics-author': 'Metrics',
  'autofactory-manifest-steward': 'Release',
  'autofactory-flag-testing': 'Tests',
  'autofactory-code-reviewer': 'Review',
};

const done = new Set();
const started = new Set();
const announced = new Set();

// Artifacts from EARLIER runs must not count as this run's progress, or the pane
// jumps straight to done on a repeat demo. Snapshot what already exists first and
// only treat additions as signals.
const baseline = { flags: new Set(), metrics: new Set(), commits: new Set() };

// Commit SHA -> the files it touched, so a commit is inspected once.
const commitFiles = new Map();
let lastGhTransient = false;
let consecutiveGhMisses = 0;

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
  process.stderr.write(`\r  [${track}] ${pct}%  ${label.padEnd(28)}`);
}

/** "step 3/6 Metrics" — where the chain is, by number, with the pane's title. */
function stepLabel(key) {
  const i = CHAIN.indexOf(key);
  if (i === -1) return key;
  return `step ${i + 1}/${CHAIN.length} ${TITLES[key] ?? key.replace('autofactory-', '')}`;
}

/** Mark a node running (once), which is what lights the step up in the pane. */
function start(key) {
  if (started.has(key) || done.has(key)) return;
  started.add(key);
  say(`[node] ${key} anthropic model → '${MODEL}'`);
}

function finish(key, tags = {}) {
  if (done.has(key)) return;
  // Artifacts arrive out of order (a manifest commit can land before the LD
  // flag is visible). The real chain is sequential, so completing a later
  // node implies every earlier one already ran — mark them done first or the
  // pane shows Manifest green while Flag is still "running".
  const at = CHAIN.indexOf(key);
  if (at > 0) {
    for (let i = 0; i < at; i++) finish(CHAIN[i]);
  }
  start(key);
  done.add(key);
  say(`■ step ${at + 1} done: ${key} (${key}) [ok] tags: ${JSON.stringify(tags)}`);
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
    lastGhTransient = r.status === 429 || r.status >= 500;
    return r.ok ? await r.json() : null;
  } catch {
    lastGhTransient = true;
    return null;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GitHub withholds the job log while a run is live, which is why tick() has to
// infer progress from flags, metrics and commits. The moment the run completes,
// however, the log becomes authoritative. Reconcile from it before closing the
// stream so rejected runs still show all six agents and the review verdict
// instead of looking as if the chain stopped at the first artifact we missed.
//
// `gh` is invoked without a shell: runId and slug are arguments, never command
// text. Failure is non-fatal; the artifact view remains better than no view.
function reconcileFromFinalLog() {
  const result = spawnSync(
    'gh',
    ['run', 'view', runId, '--repo', slug, '--log'],
    {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.status !== 0 || !result.stdout) {
    return { reviewFound: false, reviewRejected: false };
  }

  let reviewFound = false;
  let reviewRejected = false;
  for (const raw of result.stdout.split(/\r?\n/)) {
    // gh prefixes each line with job, step and timestamp columns.
    const fields = raw.split('\t');
    const line = fields.length >= 3 ? fields.slice(2).join('\t').replace(/^\S+Z\s+/, '') : raw;

    const node = line.match(/═+\s*(autofactory-[a-z0-9-]+)\s*\[([a-z-]+)\]/i);
    if (node) {
      const [, key, status] = node;
      say(line);
      if (status === 'completed' || status === 'stopped') done.add(key);
      started.add(key);
      continue;
    }

    // This compact tags line is what progress-tap uses for the pane verdict.
    if (/"review_approved"\s*:\s*"?(?:true|false|null)"?/.test(line)) {
      reviewFound = true;
      say(line);
      if (/"review_approved"\s*:\s*"?false"?/.test(line)) reviewRejected = true;
      continue;
    }

    if (/^Verdict\s*→/i.test(line)) {
      say(line);
      if (/REJECTED/i.test(line)) reviewRejected = true;
    }
  }
  return { reviewFound, reviewRejected };
}

// The factory posts its verdict as a PR comment, titled "LaunchDarkly
// Auto-Factory — Phase 1" with a "Verdict:" line, from the github-actions bot.
// Linking that comment rather than the PR matters when the reviewer says no:
// the reasoning is the thing worth showing, and hunting for it in a long thread
// mid-demo is not.
//
// Scored rather than first-match: a PR accumulates comments (earlier runs, human
// replies), and the wrong one is worse than the PR fallback because it looks
// authoritative. Highest score, and the newest among ties, wins.
async function verdictComment() {
  const comments = await gh(`/issues/${pr}/comments?per_page=100`);
  if (!comments?.length) return null;

  const score = (c) => {
    const body = c?.body ?? '';
    let s = 0;
    // The factory's own heading is the strongest signal.
    if (/auto-?factory\s*[—–-]\s*phase\s*1/i.test(body)) s += 3;
    else if (/auto-?factory/i.test(body)) s += 1;
    // A verdict line is what we actually want to land on.
    if (/^\s*verdict\s*[:—–-]/im.test(body)) s += 2;
    else if (/\bverdict\b/i.test(body)) s += 1;
    // The factory comments as the Actions bot; a human quoting it should lose.
    if (c?.user?.login === 'github-actions[bot]' || c?.user?.type === 'Bot') s += 1;
    return s;
  };

  let best = null;
  let bestScore = 0;
  for (const c of comments) {
    const s = score(c);
    // >= so that among equal scores the later comment (this run's) replaces an
    // earlier one, since the list is chronological.
    if (s > 0 && s >= bestScore) {
      best = c;
      bestScore = s;
    }
  }
  // A weak lone match (e.g. someone typed "auto-factory") is not worth linking
  // over the PR itself; require real confidence.
  return best && bestScore >= 3 ? best.html_url : null;
}

// If GitHub disappears after the real run has started, keep the presentation
// moving but make the boundary impossible to miss. Already-observed steps stay
// real; only the remainder is simulated, with no fabricated resources/verdict.
async function finishVisually() {
  mkdirSync('.autofactory', { recursive: true });
  writeFileSync(
    '.autofactory/github-offline',
    'GitHub API outage detected while watching the Actions run\n',
  );
  say('::error::GitHub connection lost — continuing as visual simulation only; remaining steps are not real');
  for (const key of CHAIN) {
    if (done.has(key)) continue;
    start(key);
    bar(`${stepLabel(key)} (simulated)`);
    await wait(Number(process.env.FACTORY_FALLBACK_STEP_MS || 1500));
    finish(key, { simulated: 'true' });
  }
  bar('visual simulation complete');
  process.stderr.write('\n');
  say('::error::Visual simulation complete — check GitHub and rerun; no success verdict was produced');
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
  bar(next ? stepLabel(next) : 'finishing');

  const run = await gh(`/actions/runs/${runId}`);
  if (!run && lastGhTransient) {
    consecutiveGhMisses += 1;
    if (consecutiveGhMisses >= 3) return 'github-offline';
  } else {
    consecutiveGhMisses = 0;
  }
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

if (conclusion === 'github-offline') {
  await finishVisually();
} else if (conclusion === 'success') {
  const { reviewFound } = reconcileFromFinalLog();
  for (const k of CHAIN) finish(k);
  bar(`step ${CHAIN.length}/${CHAIN.length} done`);
  process.stderr.write('\n');
  // Older Action logs may not carry structured review tags. Only synthesize a
  // verdict for those; otherwise the reviewer's real risk level must win.
  if (!reviewFound) say('{"review_approved":true,"risk_level":"low"}');
} else if (conclusion) {
  const { reviewRejected } = reconcileFromFinalLog();
  process.stderr.write('\n');
  const stuck = CHAIN.find((k) => !done.has(k));
  if (reviewRejected) {
    // Fetch the comment first so the note itself carries the link — the pane
    // linkifies any URL in the text, and "see the verdict" with nowhere to go
    // is the thing being fixed. Fall back to the PR when the comment is not
    // found, and to plain text only if there is no PR link at all.
    const url = (await verdictComment()) || (pr ? `https://github.com/${slug}/pull/${pr}` : '');
    say(
      url
        ? `::error::AutoFactory: code review rejected — all agents completed; see the verdict → ${url}`
        : '::error::AutoFactory: code review rejected — all agents completed; see the verdict',
    );
    if (url) say(`Verdict: rejected → ${url}`);
  } else if (stuck) {
    say(`::error::AutoFactory: run ${conclusion} at ${stuck}`);
  }
}
say(`Ran ${done.size} node(s): ${[...done].join(' → ')}`);
