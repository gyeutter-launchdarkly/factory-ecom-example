#!/usr/bin/env node
/**
 * Factory progress tap.
 *
 * Reads the factory's stdout on stdin and appends a structured NDJSON event
 * stream to .autofactory/runs.ndjson for the in-app flowchart to read. Direct
 * commands echo every line through unchanged; the menu sets
 * FACTORY_PROGRESS_ONLY=1, which leaves the terminal with the numbered steps
 * its runner prints, the progress bar, and problems — everything else is the
 * pane's job.
 *
 * Usage:  <factory command> 2>&1 | node demo/lib/progress-tap.mjs <scenario>
 *
 * One factory run per PR, so every event carries a `run` id and the log is
 * append-only. Concurrent runs (several PRs in flight) interleave safely in the
 * file because the reader groups by `run` rather than assuming a single flow.
 * The log rotates once it passes ROTATE_BYTES so it cannot grow without bound.
 *
 * Two producers are recognised:
 *
 *   phase1-cli  emits live per-step lines as each agent starts and finishes:
 *                 "▶ step 1: Plan (autofactory-research-planner)"
 *                 "■ step 1 done: Plan (...) [ok] tags: {...}"
 *               This is the only producer that gives a genuinely live flowchart.
 *
 *   the Action (what `make ci` runs under act) emits nothing per-step; it dumps
 *               "════════ <configKey> [<status>] ════════" blocks only after the
 *               whole walk finishes. We parse those too, so the flowchart still
 *               fills in, just all at once at the end rather than progressively.
 */

import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';

const OUT = process.env.FACTORY_PROGRESS_FILE
  ? resolve(process.env.FACTORY_PROGRESS_FILE)
  : resolve('.autofactory/runs.ndjson');

// Every line is also mirrored into the log as a `log` event so the pane can
// show the console the terminal is no longer printing in full. That is more
// bytes per run, hence the larger rotation budget.
const ROTATE_BYTES = 2 * 1024 * 1024;
const PROGRESS_ONLY = process.env.FACTORY_PROGRESS_ONLY === '1';
const MAX_LOG_CHARS = 400;

const scenario = process.argv[2] ?? 'unknown';
// The runner opens the run before this tap exists — it announces itself while
// the PR is still being created, so the pane can light up immediately instead of
// waiting a minute for GitHub to hand back a run id. Adopting its id keeps that
// head start and the streamed events as one run rather than two.
const runId = process.env.FACTORY_RUN_ID || `${scenario}-${Date.now()}`;

mkdirSync(dirname(OUT), { recursive: true });

// Append-only, so runs for different PRs coexist. Rotate only when the log gets
// large; the reader notices the file shrank and re-reads from the start.
try {
  if (statSync(OUT).size > ROTATE_BYTES) writeFileSync(OUT, '');
} catch {
  writeFileSync(OUT, '');
}

let seq = 0;
function emit(event) {
  try {
    appendFileSync(
      OUT,
      JSON.stringify({ run: runId, scenario, seq: seq++, at: Date.now(), ...event }) + '\n',
    );
  } catch {
    // Never let telemetry break the factory run.
  }
}

emit({ t: 'run-start' });

// Repo slug for PR deep links. Set by the runner scripts (they know it from the
// event payload or the git remote); absent means the pane omits the PR link
// rather than guessing a URL.
if (process.env.FACTORY_REPO) emit({ t: 'repo', repo: process.env.FACTORY_REPO });

// Pull "autofactory-foo" out of a title like "Research & plan (autofactory-foo)",
// or accept a bare key.
function keyOf(text) {
  const paren = text.match(/\((autofactory-[a-z0-9-]+)\)/);
  if (paren) return paren[1];
  const bare = text.match(/(autofactory-[a-z0-9-]+)/);
  return bare ? bare[1] : null;
}

function parseTags(text) {
  const i = text.indexOf('tags: ');
  if (i === -1) return undefined;
  try {
    return JSON.parse(text.slice(i + 6).trim());
  } catch {
    return undefined;
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

// Set while the "why: <agent>" block is streaming (the deciding agent's own
// words after a rejection). Its first substantive line becomes a note, so the
// reason is on screen in the pane instead of only in the console scrollback.
let whyAgent = null;

rl.on('line', (line) => {
  // Heartbeats exist only to tell the pane a slow run is still alive, so they
  // are consumed rather than echoed: printing one every 30s would bury the
  // factory's own output. The single exception to the pass-through rule below.
  if (/\[heartbeat\]\s*$/.test(line)) {
    emit({ t: 'heartbeat' });
    return;
  }

  // The terminal is the summary and the pane is the detail, so every line goes
  // to the pane's console whatever the terminal is told. Carriage returns and
  // ANSI colour would render as noise in HTML, so they are stripped here rather
  // than in the browser.
  const text = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '').trimEnd();
  if (text) emit({ t: 'log', text: text.slice(0, MAX_LOG_CHARS) });

  // Direct commands remain verbose for debugging. The TUI keeps only what needs
  // a person: the runner already prints a numbered line per step and the bar
  // shows the chain, so narration (`» `) is the pane's — repeating it in the
  // terminal is the same story twice. Problems still come through, stripped of
  // the ::directive:: syntax that means nothing outside Actions.
  const problem =
    /::(?:error|warning)::|⛔|⏸|awaiting approval|\[(?:failed|failure)\]|^\s*(?:error|fatal|warning|failed to|could not)\b/i.test(
      line,
    );
  if (!PROGRESS_ONLY) {
    process.stdout.write(line + '\n');
  } else if (problem) {
    const warn = /::warning::|⏸|awaiting approval|^\s*warning\b/i.test(line);
    const clean = text.replace(/^.*?(?:::(?:error|warning)::|⛔|⏸)\s*/, '').trim() || text;
    process.stdout.write(`  \x1b[${warn ? 33 : 31}m!\x1b[0m ${clean}\n`);
  }

  // act prefixes lines with "[Workflow/job] ", so match anywhere, not anchored.

  // The rejecting agent's rationale, printed by the runner when a run does not
  // end in an approval. The header is deliberately not the Action's "════" node
  // dump: this is an explanation, not a status, and must not re-mark the step.
  let m = line.match(/────+\s*why:\s*(autofactory-[a-z0-9-]+)\s*\[([a-z-]+)\]/i);
  if (m) {
    whyAgent = m[1];
    return;
  }
  if (whyAgent) {
    const first = text.trim();
    // Fenced verdict JSON and dividers are not the reason; keep waiting.
    if (first && !/^[`─═-]+$/.test(first) && !/^\s*{/.test(first)) {
      emit({ t: 'note', level: 'error', text: `${whyAgent}: ${first}`.slice(0, 400) });
      whyAgent = null;
    }
    return;
  }

  // The PR this run belongs to, so the pane can label the flow. The same line
  // carries the provider (the coding agent backend: anthropic | cursor | vega).
  m = line.match(/Phase 1:\s*PR #(\d+)/);
  if (m) {
    emit({ t: 'pr', number: Number(m[1]) });
    const prov = line.match(/\[provider:\s*([a-z]+)\]/i);
    if (prov) emit({ t: 'provider', provider: prov[1] });
    return;
  }

  // Which model ran a given node, resolved from its LD AI config:
  //   "[node] autofactory-research-planner anthropic model → 'claude-...'"
  //
  // The Action prints this as each node BEGINS, which is the only per-step
  // signal it emits (it passes onEvent=undefined to walkGraph, so there are no
  // ▶/■ lines). Treat it as a node-start too: without this the flowchart sits at
  // 0/6 for the whole run and only fills in from the post-walk dump at the end.
  m = line.match(/\[node\]\s+(autofactory-[a-z0-9-]+)\s+([a-z]+)\s+model\s*→\s*'([^']+)'/i);
  if (m) {
    emit({ t: 'agent', key: m[1], provider: m[2], model: m[3] });
    emit({ t: 'node', key: m[1], status: 'running' });
    return;
  }

  // phase1-cli: a step is starting.
  m = line.match(/▶\s*step\s+(\d+):\s*(.+)$/);
  if (m) {
    const key = keyOf(m[2]);
    if (key) emit({ t: 'node', key, status: 'running', index: Number(m[1]) });
    return;
  }

  // phase1-cli: a step finished.
  m = line.match(/■\s*step\s+(\d+)\s+done:\s*(.+)$/);
  if (m) {
    const key = keyOf(m[2]);
    const status = /\[failed\]/i.test(m[2]) ? 'failed' : 'done';
    const tags = parseTags(m[2]);
    if (key) emit({ t: 'node', key, status, index: Number(m[1]), tags });
    // The reviewer reports its call as a routing tag, and this line used to
    // return before the verdict block below ever saw it — so a rejection
    // reached the pane only if the log happened to also print the compact
    // verdict line, and the Review box stayed green when it did not.
    if (tags && 'review_approved' in tags) {
      emit({
        t: 'verdict',
        approved: String(tags.review_approved) === 'true',
        risk: typeof tags.risk_level === 'string' ? tags.risk_level : null,
      });
    }
    return;
  }

  // The Action's post-walk per-node dump.
  m = line.match(/════+\s*(autofactory-[a-z0-9-]+)\s*\[([a-z-]+)\]/i);
  if (m) {
    emit({ t: 'node', key: m[1], status: m[2] === 'failed' ? 'failed' : 'done' });
    return;
  }

  // Chain order actually taken, and anything skipped.
  m = line.match(/Ran\s+\d+\s+node\(s\):\s*(.+)$/);
  if (m) {
    emit({ t: 'order', keys: m[1].split('→').map((s) => s.trim()).filter(Boolean) });
    return;
  }
  m = line.match(/Skipped:\s*(.+)$/);
  if (m) {
    for (const k of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      emit({ t: 'node', key: k, status: 'skipped' });
    }
    return;
  }

  // A LaunchDarkly judge's score for the node it evaluated. Judges are sampled
  // and non-blocking, so a score is quality signal rather than a gate — but it
  // is the platform's own evaluation of the agent's work, and until now it
  // reached the pane only as a line of console text nobody reads on stage.
  m = line.match(/\[judge\]\s+(autofactory-[a-z0-9-]+)\s*←\s*'([^']+)'\s+score=([0-9.]+|n\/a)/i);
  if (m) {
    const reasoning = line.split('—').slice(1).join('—').trim();
    emit({
      t: 'judge',
      key: m[1],
      judge: m[2],
      score: m[3] === 'n/a' ? null : Number(m[3]),
      ...(reasoning ? { reasoning: reasoning.slice(0, 300) } : {}),
    });
    return;
  }

  // The closing summary repeats the score without naming the judge, and is the
  // only form a log-reconciled run may have.
  m = line.match(/^\s*Judge:\s*(autofactory-[a-z0-9-]+)\s+scored\s+([0-9.]+)/i);
  if (m) {
    emit({ t: 'judge', key: m[1], judge: null, score: Number(m[2]) });
    return;
  }

  // Deterministic handoff checks: the gates that re-derive an agent's claims
  // from LaunchDarkly and the checkout instead of trusting its own report.
  m = line.match(/\[verify\]\s+(autofactory-[a-z0-9-]+)\s+([✓✗])\s+([a-z0-9-]+):\s*(.*)$/i);
  if (m) {
    emit({ t: 'check', key: m[1], name: m[3], ok: m[2] === '✓', detail: m[4].trim().slice(0, 200) });
    return;
  }

  // The failure summary names every failed check at once. Not consumed: a
  // halted chain is also the run's error, so it falls through to the note.
  m = line.match(/Deterministic check failed after '(autofactory-[a-z0-9-]+)':\s*(.+)$/);
  if (m) {
    for (const part of m[2].split(';')) {
      const failure = part.trim().match(/^\[([a-z0-9-]+)\]\s*(.*)$/i);
      if (failure) {
        emit({ t: 'check', key: m[1], name: failure[1], ok: false, detail: failure[2].slice(0, 200) });
      }
    }
  }

  // Stalls, gates, and deterministic-check failures are worth surfacing. The
  // cap is generous because a note can end in a URL (the verdict comment), and
  // clipping that would turn a working link into a 404.
  if (/⏸\s*approval gate|awaiting approval before/.test(line)) {
    emit({ t: 'note', level: 'warn', text: line.replace(/^.*?(⏸|::warning::)\s*/, '').slice(0, 400) });
    return;
  }
  if (/⛔|::error::/.test(line)) {
    emit({ t: 'note', level: 'error', text: line.replace(/^.*?(⛔|::error::)\s*/, '').slice(0, 400) });
    return;
  }

  // Flag / metric links the factory reports, so the pane can deep-link to LD;
  // "Run" is the runner's own link to the GitHub Actions run, and "Verdict" the
  // reviewer's comment on the PR — where a rejection is actually explained.
  //
  // The general form also places evidence at a metro station:
  //   Resource: agent-config autofactory-flag-implementer
  //             @autofactory-flag-implementer → https://...
  m = line.match(
    /^\s*(?:»\s*)?Resource:\s*([a-z-]+)\s+(\S+?)(?:\s+@([a-z0-9-]+))?\s*→\s*(\S+)/i,
  );
  if (m) {
    emit({
      t: 'resource',
      kind: m[1].toLowerCase(),
      key: m[2],
      url: m[4],
      ...(m[3] ? { station: m[3] } : {}),
    });
    return;
  }

  m = line.match(
    /^\s*(?:»\s*)?(?:\[[^\]]*\]\s*\|?\s*)?(Flag|Metric|Run|Verdict):\s*([a-z0-9-]+)\s*→\s*(\S+)/i,
  );
  if (m) {
    emit({ t: 'resource', kind: m[1].toLowerCase(), key: m[2], url: m[3] });
    return;
  }

  // Final verdict block.
  // Agent tags are strings ("false"), while the compact synthetic verdict is a
  // boolean (false). Accept both; previously real review verdicts never reached
  // the pane even though the terminal printed them.
  m = line.match(/"review_approved"\s*:\s*"?(true|false|null)"?/);
  if (m) {
    const risk = line.match(/"risk_level"\s*:\s*"([^"]+)"/);
    emit({ t: 'verdict', approved: m[1] === 'true', risk: risk ? risk[1] : null });
  }
});

rl.on('close', () => {
  emit({ t: 'run-done' });
});
