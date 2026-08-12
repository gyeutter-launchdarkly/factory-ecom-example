#!/usr/bin/env node
/**
 * Factory progress tap.
 *
 * Reads the factory's stdout on stdin, echoes every line through unchanged (so
 * the terminal experience is identical), and appends a structured NDJSON event
 * stream to .autofactory/runs.ndjson for the in-app flowchart to read.
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
 *                 "▶ step 1: Research & plan (autofactory-research-planner)"
 *                 "■ step 1 done: Research & plan (...) [ok] tags: {...}"
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

const ROTATE_BYTES = 512 * 1024;

const scenario = process.argv[2] ?? 'unknown';
const runId = `${scenario}-${Date.now()}`;

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

rl.on('line', (line) => {
  // Pass through first, always — the tap must never swallow output.
  process.stdout.write(line + '\n');

  // act prefixes lines with "[Workflow/job] ", so match anywhere, not anchored.

  // The PR this run belongs to, so the pane can label the flow. The same line
  // carries the provider (the coding agent backend: anthropic | cursor | vega).
  let m = line.match(/Phase 1:\s*PR #(\d+)/);
  if (m) {
    emit({ t: 'pr', number: Number(m[1]) });
    const prov = line.match(/\[provider:\s*([a-z]+)\]/i);
    if (prov) emit({ t: 'provider', provider: prov[1] });
    return;
  }

  // Which model actually ran a given node, resolved from its LD AI config:
  //   "[node] autofactory-research-planner anthropic model → 'claude-...'"
  m = line.match(/\[node\]\s+(autofactory-[a-z0-9-]+)\s+([a-z]+)\s+model\s*→\s*'([^']+)'/i);
  if (m) {
    emit({ t: 'agent', key: m[1], provider: m[2], model: m[3] });
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
    if (key) emit({ t: 'node', key, status, index: Number(m[1]), tags: parseTags(m[2]) });
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

  // Stalls, gates, and deterministic-check failures are worth surfacing.
  if (/⏸\s*approval gate|awaiting approval before/.test(line)) {
    emit({ t: 'note', level: 'warn', text: line.replace(/^.*?(⏸|::warning::)\s*/, '').slice(0, 200) });
    return;
  }
  if (/⛔|::error::/.test(line)) {
    emit({ t: 'note', level: 'error', text: line.replace(/^.*?(⛔|::error::)\s*/, '').slice(0, 200) });
    return;
  }

  // Flag / metric links the factory reports, so the pane can deep-link to LD.
  m = line.match(/^\s*(?:\[[^\]]*\]\s*\|?\s*)?(Flag|Metric):\s*([a-z0-9-]+)\s*→\s*(\S+)/i);
  if (m) {
    emit({ t: 'resource', kind: m[1].toLowerCase(), key: m[2], url: m[3] });
    return;
  }

  // Final verdict block.
  m = line.match(/"review_approved"\s*:\s*(true|false|null)/);
  if (m) {
    const risk = line.match(/"risk_level"\s*:\s*"([^"]+)"/);
    emit({ t: 'verdict', approved: m[1] === 'true', risk: risk ? risk[1] : null });
  }
});

rl.on('close', () => {
  emit({ t: 'run-done' });
});
