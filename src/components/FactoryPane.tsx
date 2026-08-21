'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDemoPack } from '@/lib/use-demo-pack';
import { Link, Linkify } from './links';
import { PipelineRail } from './PipelineRail';
import {
  AGENTS,
  CONTROL_PLANE,
  EVIDENCE_GATES,
  GUARDED_RELEASE,
  REVIEWER,
  type Check,
  type Detail,
  type Judge,
} from '@/lib/pipeline';

// Live AutoFactory flowchart, docked to the bottom of the page. Subscribes to
// /api/factory-progress (SSE, fed by demo/lib/progress-tap.mjs).
//
// There is one factory run per PR, so state is keyed by run id and the dropdown
// selects which PR's flow to show. Several PRs can be in flight at once; their
// events interleave in the log and are demultiplexed here by `run`.
//
// Three visibility states so it can be shown and hidden on demand:
//   expanded  full flowchart
//   collapsed slim summary bar, click to expand
//   hidden    fully out of the way, restored from a small corner pill

type Status = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
type View = 'expanded' | 'collapsed' | 'hidden';
type Size = 'normal' | 'large';

// The agents are the part of the pipeline a run reports progress against, so
// they still drive the counter, the per-step clocks and the presenter cues. The
// stages around them — the PR, the control plane, the gates, the release — are
// drawn by PipelineRail from the same events. See src/lib/pipeline.ts.
const CHAIN = AGENTS;

const MAX_RUNS = 12;

/** "1m12s" / "43s" — a demo is minutes, so hours never come up. */
function duration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, '0')}s`;
}

// Console scrollback per run. The terminal only prints progress and errors now,
// so this is where the full narration lives; a demo run is a few hundred lines.
const MAX_LOG_LINES = 400;

// A run with no events for this long, that never reported completion, is
// reported as stalled rather than claimed to be running — the factory process
// may have been killed.
//
// Hosted runs emit a heartbeat every 30s, so anything approaching this means
// the watcher itself is gone. It is generous because a single agent can work
// for minutes without producing an observable artifact, and calling a healthy
// run "stalled" mid-demo is the worse failure.
const STALE_MS = 5 * 60_000;

// What the header indicator is allowed to claim.
type Health = 'offline' | 'idle' | 'running' | 'stalled';

const HEALTH_TITLE: Record<Health, string> = {
  offline: 'Not connected to the progress stream',
  idle: 'Connected. No factory run in progress',
  running: 'A factory run is in progress',
  stalled: 'A run started but has not reported for a while',
};

type Resource = { kind: string; key: string; url: string };

type Run = {
  id: string;
  scenario: string;
  pr: number | null;
  startedAt: number;
  /** Timestamp of this run's most recent event, used to detect a stalled run. */
  lastEventAt: number;
  /** When the run reported completion, so the clock stops rather than runs on. */
  endedAt: number | null;
  finished: boolean;
  statuses: Record<string, Status>;
  /** First and last time each node was seen, for its elapsed time. */
  timings: Record<string, { startedAt: number; endedAt: number | null }>;
  /** Routing tags each node emitted — its claims (flag_key, metric_keys, ...). */
  tags: Record<string, Record<string, string>>;
  /** Which model ran each node, resolved from its LaunchDarkly AI config. */
  agents: Record<string, { provider: string; model: string }>;
  /** LaunchDarkly judge scores per node, when the judge was sampled. */
  judges: Record<string, Judge[]>;
  /** Deterministic handoff checks per node — the gates, not the model. */
  checks: Record<string, Check[]>;
  provider: string | null;
  /** owner/repo, for PR deep links. Absent means no link is offered. */
  repo: string | null;
  resources: Resource[];
  note: { level: string; text: string } | null;
  /** The code reviewer's closing call, once it has one. */
  verdict: { approved: boolean; risk: string | null } | null;
  /** Everything the runner printed, for the console panel. */
  log: string[];
};

function emptyRun(id: string, scenario: string, at: number): Run {
  return {
    id,
    scenario,
    pr: null,
    startedAt: at,
    lastEventAt: at,
    endedAt: null,
    finished: false,
    statuses: {},
    timings: {},
    tags: {},
    agents: {},
    judges: {},
    checks: {},
    provider: null,
    repo: null,
    resources: [],
    note: null,
    verdict: null,
    log: [],
  };
}

// Per-node detail lines. Everything shown here comes from what the node
// actually emitted: its routing tags (the claims the handoff verifier checks)
// plus the model resolved from its LaunchDarkly AI config. Tag vocabulary per
// packages/shared/src/handoffVerifier.ts.
const TAG_LABELS: Record<string, string> = {
  flag_key: 'flag',
  metric_keys: 'metrics',
  metric_event_keys: 'events',
  tests_last_run: 'tests',
  manifest_path: 'manifest',
};

// Shown elsewhere or too noisy for a box.
const TAG_SKIP = new Set([
  'flag_ready',
  'risk_level',
  'risk_score',
  'review_approved',
  'review_decision',
  'skip_flagging',
]);

function shortModel(model: string): string {
  // "claude-sonnet-4-5-20250929" -> "sonnet-4-5"
  const m = model.match(/(opus|sonnet|haiku|fable)-([0-9]+(?:-[0-9]+)?)/i);
  return m ? `${m[1].toLowerCase()}-${m[2]}` : model.replace(/^claude-/, '').slice(0, 18);
}

/** URL the factory itself reported for a flag/metric key, if any. */
function resourceUrl(run: Run, key: string): string | undefined {
  return run.resources.find((r) => r.key === key)?.url;
}

function detailsFor(run: Run, nodeKey: string): Detail[] {
  const out: Detail[] = [];

  const agent = run.agents[nodeKey];
  if (agent) out.push({ text: shortModel(agent.model) });

  const tags = run.tags[nodeKey] ?? {};

  // Flags and metrics link to LaunchDarkly using the URLs the factory printed,
  // so the pane never has to synthesise an app URL.
  if (tags.flag_key) {
    out.push({ text: `flag: ${tags.flag_key}`, url: resourceUrl(run, tags.flag_key) });
  }
  for (const key of ['metric_keys', 'metric_event_keys'] as const) {
    const raw = tags[key];
    if (!raw) continue;
    const prefix = key === 'metric_keys' ? 'metric' : 'event';
    for (const k of raw.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (out.length >= 5) break;
      out.push({ text: `${prefix}: ${k}`, url: resourceUrl(run, k) });
    }
  }
  if (tags.tests_last_run) out.push({ text: `tests: ${tags.tests_last_run}` });
  if (tags.manifest_path) out.push({ text: `manifest: ${tags.manifest_path.split('/').pop()}` });

  // Anything else the node claimed that is not already covered.
  for (const [k, v] of Object.entries(tags)) {
    if (out.length >= 5) break;
    if (k in TAG_LABELS || TAG_SKIP.has(k) || !v) continue;
    out.push({ text: `${k.replace(/_/g, ' ')}: ${v}` });
  }

  return out.slice(0, 5);
}

const TITLE_OF = new Map(CHAIN.map((n, i) => [n.key, { title: n.title, step: i + 1 }]));

/**
 * The factory's wire format, said in English.
 *
 * `[node] autofactory-flag-implementer anthropic model → 'claude-haiku-4-5-…'`
 * is the *start* of a step, and `■ step 2 done: key (key) [ok] tags: {}` its
 * end — but neither reads that way, the key is printed twice, and "[node]" says
 * nothing about what is happening. These lines are the parser's contract, so
 * they are rewritten here for display only and left untouched on the wire.
 */
function prettifyLogLine(text: string): string {
  // A step starting.
  let m = text.match(/^\s*\[node\]\s+(autofactory-[a-z0-9-]+)\s+([a-z]+)\s+model\s*→\s*'([^']+)'/i);
  if (m) {
    const node = TITLE_OF.get(m[1]);
    const label = node ? `step ${node.step}/${CHAIN.length} ${node.title}` : m[1];
    return `▸ ${label} — started on ${m[2]} ${shortModel(m[3])}`;
  }

  // A step finishing, with whatever it claimed. The hosted watcher names the
  // node twice and the replay leads with its title, so the key is found
  // wherever it sits and the step number carries the line if it is absent.
  m = text.match(/^\s*■\s*step\s+(\d+)\s+done:\s*(.+)$/);
  if (m) {
    const rest = m[2];
    const key = rest.match(/autofactory-[a-z0-9-]+/)?.[0];
    const node = (key && TITLE_OF.get(key)) || {
      title: CHAIN[Number(m[1]) - 1]?.title,
      step: Number(m[1]),
    };
    const label = node.title
      ? `step ${node.step}/${CHAIN.length} ${node.title}`
      : `step ${m[1]}/${CHAIN.length}`;
    const state = rest.match(/\[([a-z]+)\]/i)?.[1] ?? 'ok';
    const tagsJson = rest.match(/tags:\s*(\{.*\})\s*$/)?.[1];
    const ok = /ok/i.test(state);
    let outcome = ok ? 'finished' : state;
    let claims = '';
    let mark = ok ? '✓' : '✗';
    try {
      const tags = tagsJson ? (JSON.parse(tagsJson) as Record<string, unknown>) : {};
      // The reviewer's step succeeds even when its verdict is a rejection, so
      // "finished" alone would report a blocked PR as a clean pass.
      if ('review_approved' in tags) {
        const approved = String(tags.review_approved) === 'true';
        outcome = approved ? 'approved the diff' : 'rejected the diff';
        if (!approved) mark = '✗';
      }
      // The same vocabulary the step boxes use, so the console and the
      // flowchart never describe one result two different ways.
      const parts = Object.entries(tags)
        .filter(([k, v]) => v && !TAG_SKIP.has(k))
        .map(([k, v]) => {
          const short = String(v).split('/').pop() ?? String(v);
          return `${TAG_LABELS[k] ?? k.replace(/_/g, ' ')}: ${short}`;
        });
      if (tags.risk_level) parts.push(`risk: ${tags.risk_level}`);
      if (parts.length) claims = ` — ${parts.join(', ')}`;
    } catch {
      // Malformed tags are not worth losing the line over.
    }
    return `${mark} ${label} — ${outcome}${claims}`;
  }

  // phase1-cli announces a step too, without the model the [node] line carries.
  m = text.match(/^\s*▶\s*step\s+(\d+):\s*(.+)$/);
  if (m) {
    const key = m[2].match(/autofactory-[a-z0-9-]+/)?.[0];
    const node = (key && TITLE_OF.get(key)) || {
      title: CHAIN[Number(m[1]) - 1]?.title,
      step: Number(m[1]),
    };
    return `▸ step ${node.step}/${CHAIN.length} ${node.title ?? m[2]} — started`;
  }

  // The closing summary names every node again; the flowchart already shows it.
  m = text.match(/^\s*Ran\s+(\d+)\s+node\(s\):/i);
  if (m) return `✓ chain complete — ${m[1]} of ${CHAIN.length} steps ran`;

  // The reviewer's verdict arrives as a bare JSON object when the log did not
  // carry a readable one. Unreadable as-is, and it is the run's conclusion.
  m = text.match(/^\s*\{"review_approved":\s*(true|false)(?:,\s*"risk_level":\s*"([a-z]+)")?\s*\}\s*$/i);
  if (m) {
    const approved = m[1] === 'true';
    return `${approved ? '✓' : '✗'} Review — ${approved ? 'approved the diff' : 'rejected the diff'}${
      m[2] ? ` — risk: ${m[2]}` : ''
    }`;
  }

  // A deterministic gate and a judge score. Both are pills on the step now, but
  // the console is the run's transcript, so they read as sentences here rather
  // than as the wire format. A failed check leads with ✗ so it colours red.
  m = text.match(/^\s*\[verify\]\s+(autofactory-[a-z0-9-]+)\s+([✓✗])\s+([a-z0-9-]+):\s*(.*)$/i);
  if (m) {
    const node = TITLE_OF.get(m[1]);
    const where = node ? ` (${node.title})` : '';
    return `${m[2] === '✓' ? '⛊' : '✗'} check ${m[3]}${where} — ${m[4]}`;
  }
  m = text.match(
    /^\s*\[judge\]\s+(autofactory-[a-z0-9-]+)\s*←\s*'([^']+)'\s+score=([0-9.]+|n\/a)(?:\s*—\s*(.*))?$/i,
  );
  if (m) {
    const node = TITLE_OF.get(m[1]);
    return `◆ judge ${m[3]} on ${node?.title ?? m[1]} — ${m[4] || m[2]}`;
  }

  // ::error:: and ::warning:: are how a step talks to GitHub Actions; outside a
  // workflow log they are punctuation in the way of the sentence.
  m = text.match(/^\s*::(error|warning)::\s*(.+)$/i);
  if (m) return `${m[1].toLowerCase() === 'error' ? '✗' : '⚠'} ${m[2]}`;

  return text;
}

/**
 * Both a `▶ step` line and a `[node]` line can announce the same step, and they
 * prettify to the same sentence bar the model. Where that happens the shorter
 * one is dropped, so announcing a step twice does not read as running it twice.
 */
function consoleLines(lines: string[]): string[] {
  const shown = lines.map(prettifyLogLine);
  return shown.filter((line, i) => {
    const next = shown[i + 1];
    return !(next && next !== line && next.startsWith(line));
  });
}

function logLineClass(text: string): string {
  if (/⛔|✗|::error::|^\s*(?:error|fatal|failed)\b/i.test(text)) return 'text-red-700';
  if (/⏸|⚠|::warning::|^\s*warning\b/i.test(text)) return 'text-amber-900';
  // Step boundaries are the spine of the run, so they read as strongly as the
  // runner's own narration; everything else stays quiet behind them.
  if (/^\s*[▸✓]/.test(text)) return 'text-ink';
  if (/^\s*»|^\s*(?:Flag|Metric|Run):/i.test(text)) return 'text-ink';
  return 'text-muted';
}

function LogLine({ text }: { text: string }) {
  return (
    <div className={`whitespace-pre-wrap break-words ${logLineClass(text)}`}>
      <Linkify
        text={text}
        className="underline decoration-rose decoration-1 underline-offset-2 hover:text-rose"
      />
    </div>
  );
}

// demo/lib/tty.sh serves the demo's tmux session here (read-only) whenever tmux
// and ttyd are installed. It is the host's port, not the container's: the
// browser reaches it directly, which is also why availability can only be
// decided in the browser.
const TERMINAL_URL = `http://127.0.0.1:${process.env.NEXT_PUBLIC_TERMINAL_PORT ?? '7681'}`;

/** Whether the mirrored terminal is being served right now. */
function useTerminalUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    let alive = true;
    // no-cors: ttyd sends no CORS headers, so the response is opaque. Enough to
    // tell "something is listening" from "connection refused", which is all
    // this decides — the iframe does the real loading.
    const probe = () =>
      fetch(`${TERMINAL_URL}/token`, { mode: 'no-cors', cache: 'no-store' })
        .then(() => alive && setUp(true))
        .catch(() => alive && setUp(false));
    void probe();
    // Re-probed so starting `make menu` after the page is open still lights the
    // tab up, and quitting it takes the tab away again.
    const t = setInterval(() => void probe(), 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return up;
}

/** The runner's console, mirrored from the terminal into the page. */
function Console({
  lines,
  tall,
  active,
}: {
  lines: string[];
  tall: boolean;
  /** What is running right now, pinned below the scrollback. */
  active?: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Follow the tail, unless the viewer has scrolled up to read something.
  const pinned = useRef(true);
  const shown = useMemo(() => consoleLines(lines), [lines]);

  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, tall]);

  return (
    <div className="bg-shell rounded-2xl overflow-hidden">
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className={`px-4 py-3 overflow-y-auto font-mono leading-relaxed ${
          tall ? 'h-72 text-[12.5px]' : 'h-40 text-[11.5px]'
        }`}
        aria-label="Factory console output"
      >
        {shown.map((line, i) => (
          <LogLine key={`${i}-${line}`} text={line} />
        ))}
      </div>

      {/* An agent can work for minutes without printing anything, so the log
          alone cannot answer "what is it doing now". Pinned rather than appended
          so scrolling back to read something does not hide it. */}
      {active && (
        <div
          className={`border-t border-hair px-4 py-2 font-mono text-ink ${
            tall ? 'text-[12.5px]' : 'text-[11.5px]'
          }`}
          aria-live="polite"
        >
          <span className="animate-pulse">{active}</span>
        </div>
      )}
    </div>
  );
}

type ControlAction = 'configure' | 'reset' | 'run' | 'replay' | 'clear-history';
type RunMode = 'hosted' | 'local' | 'recorded' | 'rehearsal';
type ScenarioStory = { problem: string; goal: string; payoff: string };
type ScenarioInfo = {
  key: string;
  title: string;
  recorded?: boolean;
  story: ScenarioStory;
};
type ControlInfo = {
  available: boolean;
  busy: boolean;
  scenarios: ScenarioInfo[];
  runtime?: {
    mode: RunMode;
    strategy: 'new' | 'attach';
    pack: string;
    packName: string;
    visibility: 'public' | 'private';
  };
  packs?: { id: string; name: string; visibility: string }[];
};
type Job = { id: string; action: ControlAction; state: string; message: string; detail?: string };

const PRESENTER_CUES: Record<string, { say: string; point: string }> = {
  // The three stages that are not agents, which is where the answer to "what is
  // LaunchDarkly adding" actually lives.
  [CONTROL_PLANE]: {
    say: 'Every agent on this rail is defined in LaunchDarkly: its instructions, its model, the tools it may use, and the order they run in.',
    point: 'Point to the control plane: changing how the factory behaves is a config change, not a redeploy of the pipeline.',
  },
  [EVIDENCE_GATES]: {
    say: 'Each claim an agent makes is re-derived from LaunchDarkly and from the code before the chain is allowed to continue.',
    point: 'Point to the gates: these are deterministic, so a confidently wrong agent still fails them.',
  },
  [GUARDED_RELEASE]: {
    say: 'After merge, LaunchDarkly runs the release itself: it ramps traffic, compares treatment against control, and rolls back on a regression.',
    point: 'Point along the dashed tail: the flag and metrics this run created are exactly what the release is judged on.',
  },
  'autofactory-research-planner': {
    say: 'The factory starts by deciding whether this change needs progressive delivery at all.',
    point: 'Point to Plan: the release mechanism is chosen from the code and request, not assumed.',
  },
  'autofactory-flag-implementer': {
    say: 'Now it creates the control point and wires the behavior behind it.',
    point: 'Point to the flag link: this is a real LaunchDarkly resource, created targeting-off.',
  },
  'autofactory-metrics-author': {
    say: 'Shipping safely needs evidence, so the factory defines success and guardrail metrics.',
    point: 'Point to the metric and event links as they appear.',
  },
  'autofactory-manifest-steward': {
    say: 'The release handoff makes this change operable after merge, not just feature-flagged.',
    point: 'Point to Release: Beacon receives a durable rollout contract.',
  },
  'autofactory-flag-testing': {
    say: 'Both flag states are tested so control and treatment remain valid release options.',
    point: 'Point to Tests and its actual test result.',
  },
  'autofactory-code-reviewer': {
    say: 'A separate reviewer judges the resulting diff and can stop the release.',
    point: 'Point to the red or green verdict—not merely whether the workflow completed.',
  },
};

type GuidedSession = { scenario: ScenarioInfo; startedAt: number };

function PresenterExperience({
  session,
  run,
  now,
  onClose,
}: {
  session: GuidedSession;
  run: Run | null;
  now: number;
  onClose: () => void;
}) {
  const freshRun =
    run &&
    run.scenario === session.scenario.key &&
    (run.startedAt >= session.startedAt - 2000 || !run.finished)
      ? run
      : null;
  const activeNode = freshRun
    ? CHAIN.find((node) => freshRun.statuses[node.key] === 'running')
    : undefined;
  // Between two agents there is still something to talk about, and it is the
  // part of the rail that is LaunchDarkly's: the configs that define the agents
  // before the first one starts, and the gates that check each one's claims
  // afterwards. Without this the strip falls back to the scenario's goal and
  // repeats itself for a minute at a time.
  const stageCue = !freshRun
    ? null
    : Object.keys(freshRun.agents).length === 0
      ? PRESENTER_CUES[CONTROL_PLANE]
      : Object.keys(freshRun.checks).length > 0
        ? PRESENTER_CUES[EVIDENCE_GATES]
        : null;
  const reviewerStarted =
    !!freshRun &&
    ['running', 'done', 'failed'].includes(freshRun.statuses[REVIEWER] ?? 'pending');
  const verdictMoment =
    !!freshRun?.finished &&
    !!freshRun.endedAt &&
    now - freshRun.endedAt < 8000;
  const act = !freshRun ? 0 : !reviewerStarted ? 1 : !freshRun.finished || verdictMoment ? 2 : 3;

  const acts = ['Customer problem', 'Factory at work', 'Independent verdict', 'Proof of value'];
  const cue =
    act === 0
      ? {
          say: session.scenario.story.problem,
          point: `Set the outcome before showing automation: ${session.scenario.story.goal}`,
        }
      : act === 1
        ? activeNode
          ? PRESENTER_CUES[activeNode.key]
          : (stageCue ?? {
              say: session.scenario.story.goal,
              point: 'Watch the next step turn the customer request into a concrete release artifact.',
            })
        : act === 2
          ? {
              say: freshRun?.verdict?.approved
                ? 'The reviewer approved the evidence-backed change; it is ready for controlled release.'
                : freshRun?.verdict
                  ? 'The reviewer rejected the change. That stop is the product working, not a failed demo.'
                  : 'The final agent is reviewing the complete diff and the evidence produced by every step.',
              point: 'Keep attention on Review: approval is a decision, not a green workflow icon.',
            }
          : {
              say:
                freshRun?.verdict && !freshRun.verdict.approved
                  ? 'The value here is the stop: the change did not reach customers without sufficient evidence.'
                  : session.scenario.story.payoff,
              // On an approval, the tail is the close: the flag and metrics this
              // run created are what LaunchDarkly then releases against.
              point:
                freshRun?.verdict && !freshRun.verdict.approved
                  ? 'Close on the safety stop, then open the verdict only if the audience asks for the reasoning.'
                  : PRESENTER_CUES[GUARDED_RELEASE].point,
            };

  const flagKeys = freshRun
    ? Array.from(new Set(Object.values(freshRun.tags).map((tags) => tags.flag_key).filter(Boolean)))
    : [];
  const metricKeys = freshRun
    ? Array.from(
        new Set(
          Object.values(freshRun.tags)
            .flatMap((tags) => (tags.metric_keys ?? '').split(','))
            .map((key) => key.trim())
            .filter(Boolean),
        ),
      )
    : [];
  const hasTests = !!freshRun && Object.values(freshRun.tags).some((tags) => tags.tests_last_run);
  const hasRelease = !!freshRun && Object.values(freshRun.tags).some((tags) => tags.manifest_path);

  return (
    <section className="mb-5 rounded-2xl border border-hair bg-shell/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hair">
        {acts.map((label, index) => (
          <div key={label} className="flex items-center gap-2 min-w-0">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
                index < act
                  ? 'bg-ink text-cream'
                  : index === act
                    ? 'bg-rose text-ink'
                    : 'bg-white text-muted border border-hair'
              }`}
            >
              {index < act ? '✓' : index + 1}
            </span>
            <span className={`text-[11px] truncate ${index === act ? 'text-ink font-medium' : 'text-muted'}`}>
              {label}
            </span>
            {index < acts.length - 1 && <span className="text-hair mx-1">—</span>}
          </div>
        ))}
        <button
          onClick={onClose}
          className="ml-auto text-[11px] text-muted hover:text-ink shrink-0"
        >
          end guide
        </button>
      </div>

      <div className="grid md:grid-cols-[1fr_1fr] gap-4 px-4 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted">say this</div>
          <p className="mt-1 text-[16px] leading-snug text-ink">{cue.say}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted">point out</div>
          <p className="mt-1 text-[13px] leading-snug text-muted">{cue.point}</p>
        </div>
      </div>

      {act === 3 && freshRun && (
        <div className="border-t border-hair bg-white px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-pill bg-shell px-3 py-1 text-[12px]">
              {freshRun.verdict
                ? freshRun.verdict.approved
                  ? '✓ review approved'
                  : '✕ review rejected'
                : 'review not reported'}
            </span>
            <span className="rounded-pill bg-shell px-3 py-1 text-[12px]">
              {flagKeys.length} flag{flagKeys.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-pill bg-shell px-3 py-1 text-[12px]">
              {metricKeys.length} metric{metricKeys.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-pill bg-shell px-3 py-1 text-[12px]">
              {hasTests ? '✓ both states tested' : 'tests not reported'}
            </span>
            <span className="rounded-pill bg-shell px-3 py-1 text-[12px]">
              {hasRelease ? '✓ release handoff' : 'handoff not reported'}
            </span>
            <span className="rounded-pill bg-shell px-3 py-1 text-[12px] tabular-nums">
              {duration((freshRun.endedAt ?? now) - freshRun.startedAt)} total
            </span>
          </div>
          {freshRun.resources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {freshRun.resources.map((resource) => (
                <Link
                  key={`${resource.kind}-${resource.key}`}
                  href={resource.url}
                  className="text-[12px] underline decoration-rose decoration-2 underline-offset-4"
                >
                  {resource.kind}: {resource.key}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Reset the demo, or start a run, without leaving the page.
 *
 * Nothing here executes anything: the app is a container with no repo and no
 * credentials. Each button posts an action to /api/factory-control, which
 * leaves a request for the host-side watcher, and the buttons stay disabled
 * until that watcher's heartbeat says someone is there to answer.
 */
function DemoControls({
  onCleared,
  onRunStarted,
  onGuidedRunStarted,
  currentScenario,
}: {
  onCleared: () => void;
  onRunStarted: () => void;
  onGuidedRunStarted: (scenario: ScenarioInfo) => void;
  /** The run on screen, so re-running it does not mean re-picking it. */
  currentScenario?: string;
}) {
  const [info, setInfo] = useState<ControlInfo>({ available: false, busy: false, scenarios: [] });
  const [scenario, setScenario] = useState('');
  const [mode, setMode] = useState<RunMode>('hosted');
  const [strategy, setStrategy] = useState<'new' | 'attach'>('new');
  const [pack, setPack] = useState('default');
  const [confirming, setConfirming] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch('/api/factory-control', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j: ControlInfo) => alive && setInfo(j))
        .catch(() => alive && setInfo((p) => ({ ...p, available: false })));
    void tick();
    const t = setInterval(() => void tick(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Follow the run being watched: after a rejection the next thing anyone wants
  // is that same scenario again, and hunting for it in the dropdown mid-demo is
  // the fumble this is meant to remove.
  useEffect(() => {
    if (currentScenario && info.scenarios.some((s) => s.key === currentScenario)) {
      setScenario(currentScenario);
    }
  }, [currentScenario, info.scenarios]);

  useEffect(() => {
    if (
      info.scenarios.length > 0 &&
      (!scenario || !info.scenarios.some((item) => item.key === scenario))
    ) {
      setScenario(info.scenarios[0].key);
    }
  }, [info.scenarios, scenario]);

  useEffect(() => {
    if (!info.runtime) return;
    setMode(info.runtime.mode);
    setStrategy(info.runtime.strategy);
    setPack(info.runtime.pack);
  }, [info.runtime]);

  const settled = job?.state === 'done' || job?.state === 'error';

  // Follow the job the watcher is running. A reset takes long enough that the
  // page has to say something while it happens, or it reads as a dead button.
  useEffect(() => {
    if (!job || !job.id || settled) return;
    const t = setInterval(() => {
      void fetch(`/api/factory-control?id=${job.id}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((s: Partial<Job>) => {
          setJob((prev) => (prev && prev.id === job.id ? { ...prev, ...s, id: prev.id } : prev));
          // A reset wipes the stream on the host; the pane is holding runs that
          // no longer exist anywhere, so drop them rather than show ghosts.
          if (
            s.state === 'done' &&
            (job.action === 'reset' || job.action === 'clear-history')
          ) {
            onCleared();
          }
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(t);
  }, [job, settled, onCleared]);

  const send = (action: ControlAction, guided = false) => {
    setConfirming(false);
    setJob({ id: '', action, state: 'queued', message: 'Sending…' });
    // A run started from here prints into the watcher's log, not the mirrored
    // terminal, so the terminal tab would sit still while the factory works.
    if (action === 'run') {
      const selected = info.scenarios.find((item) => item.key === scenario);
      if (guided && selected) onGuidedRunStarted(selected);
      else onRunStarted();
    }
    if (action === 'replay') onRunStarted();
    void fetch('/api/factory-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, scenario, mode, strategy, pack }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'The request was refused');
        setJob({ id: j.id, action, state: 'queued', message: 'Queued…' });
      })
      .catch((e: Error) => setJob({ id: '', action, state: 'error', message: e.message }));
  };

  const configure = (
    next: Partial<{ mode: RunMode; strategy: 'new' | 'attach'; pack: string }>,
  ) => {
    const settings = { mode, strategy, pack, ...next };
    setMode(settings.mode);
    setStrategy(settings.strategy);
    setPack(settings.pack);
    setJob({ id: '', action: 'configure', state: 'queued', message: 'Updating settings…' });
    void fetch('/api/factory-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'configure', ...settings }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Settings were refused');
        setJob({
          id: result.id,
          action: 'configure',
          state: 'queued',
          message: 'Updating settings…',
        });
      })
      .catch((error: Error) =>
        setJob({ id: '', action: 'configure', state: 'error', message: error.message }),
      );
  };

  const working = info.busy || (!!job && !settled);
  const disabled = !info.available || working;
  const selectedScenario = info.scenarios.find((item) => item.key === scenario);
  const runUnavailable = mode === 'recorded' && !selectedScenario?.recorded;
  const btn =
    'text-[12px] rounded-pill px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="border-t border-hair px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-[11px] uppercase tracking-[0.16em] text-muted shrink-0">demo</span>

      <select
        value={pack}
        onChange={(event) => configure({ pack: event.target.value })}
        disabled={disabled}
        className="bg-shell text-ink text-[12px] rounded-pill px-3 py-1.5 max-w-[180px] focus:outline-none focus:ring-1 focus:ring-rose disabled:opacity-40"
        aria-label="Demo pack"
        title="Customer packs are local or belong to a private fork"
      >
        {(info.packs ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.visibility}
          </option>
        ))}
      </select>

      <select
        value={mode}
        onChange={(event) => configure({ mode: event.target.value as RunMode })}
        disabled={disabled}
        className="bg-shell text-ink text-[12px] rounded-pill px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose disabled:opacity-40"
        aria-label="Execution mode"
      >
        <option value="hosted">Live PR · 5–10 min</option>
        <option value="local">Local agents · 3–8 min</option>
        <option value="recorded" disabled={!info.scenarios.some((item) => item.recorded)}>
          Recorded run · 30–90 sec
        </option>
        <option value="rehearsal">Rehearsal · ~12 sec</option>
      </select>

      {mode === 'hosted' && (
        <select
          value={strategy}
          onChange={(event) =>
            configure({ strategy: event.target.value as 'new' | 'attach' })
          }
          disabled={disabled}
          className="bg-shell text-ink text-[12px] rounded-pill px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose disabled:opacity-40"
          aria-label="Live PR behavior"
        >
          <option value="new">Start new run</option>
          <option value="attach">Attach to active run</option>
        </select>
      )}

      <select
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
        disabled={disabled || info.scenarios.length === 0}
        className="bg-shell text-ink text-[12px] rounded-pill px-3 py-1.5 max-w-[260px] truncate focus:outline-none focus:ring-1 focus:ring-rose disabled:opacity-40"
        aria-label="Scenario to run"
      >
        {info.scenarios.length === 0 && <option value="">no scenarios</option>}
        {info.scenarios.map((s) => (
          <option key={s.key} value={s.key} title={s.title}>
            {s.key}
          </option>
        ))}
      </select>

      <button
        onClick={() => send('run', true)}
        disabled={disabled || !scenario || runUnavailable}
        className={`${btn} bg-ink text-cream hover:bg-rose hover:text-ink`}
        title="Start this scenario with automatic presenter cues and a proof-of-value finale"
      >
        Guided run
      </button>

      <button
        onClick={() => send('run')}
        disabled={disabled || !scenario || runUnavailable}
        className={`${btn} bg-shell text-ink hover:text-rose`}
        title={
          mode === 'hosted'
            ? 'Run with a real PR and GitHub Actions'
            : mode === 'local'
              ? 'Run the real agents directly against a disposable local clone'
              : mode === 'recorded'
                ? selectedScenario?.recorded
                  ? 'Replay a previously completed real run'
                  : 'No recording has been captured for this scenario'
                : 'Synthetic run with no agents'
        }
      >
        {mode === 'hosted'
          ? strategy === 'attach'
            ? 'Attach'
            : 'Run live'
          : mode === 'local'
            ? 'Run local'
            : mode === 'recorded'
              ? 'Play recording'
              : 'Rehearse'}
      </button>

      {/* The one path that always ends approved. Labelled synthetic so the
          presenter knows what they are showing; the audience sees the same six
          steps either way. */}
      <button
        onClick={() => send('replay')}
        disabled={disabled || !scenario}
        className={`${btn} bg-shell text-ink hover:text-rose`}
        title="Synthetic run: the same six steps, always approved, about 12 seconds. Creates nothing."
      >
        Rehearse
      </button>

      {confirming ? (
        <span className="flex items-center gap-2">
          <span className="text-[12px] text-red-800">
            Close PRs, delete flags, rewind branches?
          </span>
          <button
            onClick={() => send('reset')}
            className={`${btn} bg-red-700 text-white hover:bg-red-800`}
          >
            Yes, reset
          </button>
          <button
            onClick={() => setConfirming(false)}
            className={`${btn} text-muted hover:text-ink`}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={disabled}
          className={`${btn} border border-red-200 text-red-800 hover:bg-red-50`}
          title="Full reset: closes PRs, deletes AutoFactory flags and metrics, rewinds branches"
        >
          Reset demo
        </button>
      )}

      <button
        onClick={() => send('clear-history')}
        disabled={disabled}
        className={`${btn} bg-shell text-ink hover:text-rose`}
        title="Empty this pane's run list; leaves PRs and LaunchDarkly alone"
      >
        Clear history
      </button>

      <span className="ml-auto text-[12px] text-muted text-right">
        {!info.available
          ? 'controls need the demo menu running (make menu)'
          : job
            ? job.message
            : working
              ? 'busy'
              : ''}
      </span>

      {job?.state === 'error' && job.detail && (
        <pre className="w-full bg-shell rounded-2xl px-4 py-3 text-[11.5px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
          {/* The tail of a failed reset or run — the PR and Actions URLs in it
              are the first place anybody goes next. */}
          <Linkify
            text={job.detail}
            className="underline decoration-rose decoration-1 underline-offset-2"
          />
        </pre>
      )}
    </div>
  );
}

export function FactoryPane() {
  const pack = useDemoPack();
  const [view, setView] = useState<View>('collapsed');
  const [size, setSize] = useState<Size>('normal');
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [panel, setPanel] = useState<'console' | 'terminal'>('console');
  const [guided, setGuided] = useState<GuidedSession | null>(null);
  const userPickedPanel = useRef(false);
  const terminalUp = useTerminalUp();

  // The mirrored terminal is the better view when it exists — it is the actual
  // demo session, not a reconstruction — so prefer it until asked otherwise.
  useEffect(() => {
    if (terminalUp && !userPickedPanel.current) setPanel('terminal');
    if (!terminalUp) setPanel('console');
  }, [terminalUp]);
  // Respect a manual hide, and a manual PR choice: a new run should not yank
  // the pane open or steal the selection out from under you.
  const userHid = useRef(false);
  const userPicked = useRef(false);

  useEffect(() => {
    const es = new EventSource('/api/factory-progress');
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);

    es.onmessage = (e) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === 'ping') return;

      const id = typeof m.run === 'string' ? m.run : null;
      if (!id) return;
      const scenario = typeof m.scenario === 'string' ? m.scenario : 'unknown';
      const at = typeof m.at === 'number' ? m.at : Date.now();

      setRuns((prev) => {
        const run = prev[id] ? { ...prev[id] } : emptyRun(id, scenario, at);
        run.lastEventAt = at;

        switch (m.t) {
          case 'run-start':
            // Replay after a log rotation re-sends run-start; keep accumulated
            // state rather than blanking a finished run.
            break;
          case 'pr':
            run.pr = typeof m.number === 'number' ? m.number : run.pr;
            break;
          case 'node': {
            const key = String(m.key);
            const status = m.status as Status;
            run.statuses = { ...run.statuses, [key]: status };
            const prevTiming = run.timings[key];
            run.timings = {
              ...run.timings,
              [key]: {
                startedAt: prevTiming?.startedAt ?? at,
                // Re-running a node (a retry) reopens its clock.
                endedAt: status === 'running' ? null : at,
              },
            };
            if (m.tags && typeof m.tags === 'object') {
              run.tags = {
                ...run.tags,
                [String(m.key)]: { ...(run.tags[String(m.key)] ?? {}), ...(m.tags as Record<string, string>) },
              };
            }
            break;
          }
          case 'agent':
            run.agents = {
              ...run.agents,
              [String(m.key)]: { provider: String(m.provider), model: String(m.model) },
            };
            break;
          // The platform's own opinion of an agent's work. Sampled, so most
          // runs carry one or two; non-blocking, so it never changes a status.
          case 'judge': {
            const key = String(m.key);
            const judge: Judge = {
              judge: typeof m.judge === 'string' ? m.judge : null,
              score: typeof m.score === 'number' ? m.score : null,
              ...(typeof m.reasoning === 'string' ? { reasoning: m.reasoning } : {}),
            };
            const seen = run.judges[key] ?? [];
            // The end-of-run summary repeats a score the live line already
            // reported; keeping both would double every pill.
            const already = seen.some(
              (item) => item.score === judge.score && (!judge.judge || item.judge === judge.judge),
            );
            run.judges = already
              ? run.judges
              : { ...run.judges, [key]: [...seen, judge] };
            break;
          }
          // A deterministic gate: the claim re-derived from LaunchDarkly and
          // the checkout rather than taken from the agent's own report.
          case 'check': {
            const key = String(m.key);
            const name = String(m.name);
            const seen = run.checks[key] ?? [];
            const check: Check = {
              name,
              ok: m.ok === true,
              ...(typeof m.detail === 'string' && m.detail ? { detail: m.detail } : {}),
            };
            run.checks = {
              ...run.checks,
              [key]: [...seen.filter((item) => item.name !== name), check],
            };
            break;
          }
          case 'provider':
            run.provider = String(m.provider);
            break;
          case 'repo':
            run.repo = String(m.repo);
            break;
          case 'resource':
            if (!run.resources.some((r) => r.key === m.key)) {
              run.resources = [
                ...run.resources,
                { kind: String(m.kind), key: String(m.key), url: String(m.url) },
              ];
            }
            break;
          case 'log': {
            const text = typeof m.text === 'string' ? m.text : '';
            if (!text) break;
            const next = [...run.log, text];
            run.log = next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
            break;
          }
          case 'note':
            run.note = { level: String(m.level), text: String(m.text) };
            break;
          case 'verdict': {
            const approved = m.approved === true;
            run.verdict = { approved, risk: typeof m.risk === 'string' ? m.risk : null };
            // A rejection is the reviewer doing its job, but it is still a red
            // outcome: the node reported "done" on its way to saying no, and a
            // green Review box next to "not approved" reads as a contradiction.
            run.statuses = { ...run.statuses, [REVIEWER]: approved ? 'done' : 'failed' };
            const t = run.timings[REVIEWER];
            run.timings = {
              ...run.timings,
              [REVIEWER]: { startedAt: t?.startedAt ?? at, endedAt: at },
            };
            break;
          }
          // Carry no data of their own, but they are proof the run is alive, so
          // they must still refresh lastEventAt rather than fall to `default`.
          case 'heartbeat':
          case 'order':
            break;
          case 'run-done':
            run.finished = true;
            run.endedAt = run.endedAt ?? at;
            break;
          default:
            return prev;
        }

        const next = { ...prev, [id]: run };

        // Keep the most recent runs only, so a long demo does not accumulate
        // dozens of stale flows in the dropdown.
        const ids = Object.values(next)
          .sort((a, b) => b.startedAt - a.startedAt)
          .slice(0, MAX_RUNS)
          .map((r) => r.id);
        if (ids.length < Object.keys(next).length) {
          const kept: Record<string, Run> = {};
          for (const k of ids) kept[k] = next[k];
          return kept;
        }
        return next;
      });

      // Follow the newest run unless the viewer has chosen one explicitly.
      if (m.t === 'run-start') {
        if (!userPicked.current) setSelected(id);
        if (!userHid.current) setView('expanded');
      }
    };

    return () => es.close();
  }, []);

  const showConsole = useCallback(() => {
    userPickedPanel.current = true;
    setPanel('console');
    setShowPanel(true);
  }, []);

  const startGuided = useCallback((scenario: ScenarioInfo) => {
    userHid.current = false;
    userPicked.current = false;
    userPickedPanel.current = true;
    setGuided({ scenario, startedAt: Date.now() });
    setView('expanded');
    setSize('large');
    setShowPanel(false);
  }, []);

  const clearRuns = useCallback(() => {
    setRuns({});
    setSelected(null);
    setGuided(null);
    userPicked.current = false;
  }, []);

  // Stall detection and the elapsed clocks are both time-based, so the view
  // needs its own heartbeat. Every second, because a timer that jumps five at
  // a time looks broken.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Newest first, so the dropdown reads like a PR list. The customer profile is
  // Pack scenarios are a hard boundary: a private customer demo must never
  // offer an unrelated public PR just because both share the progress stream.
  const ordered = useMemo(
    () => {
      const allowed = new Set(pack.scenarios);
      return Object.values(runs)
        .filter((run) => allowed.size === 0 || allowed.has(run.scenario))
        .sort((a, b) => b.startedAt - a.startedAt);
    },
    [pack.scenarios, runs],
  );

  const selectedRun = selected ? ordered.find((run) => run.id === selected) : null;
  const current = selectedRun || ordered[0] || null;

  const statusOf = (run: Run, key: string): Status => run.statuses[key] ?? 'pending';
  const doneCount = current
    ? CHAIN.filter((n) => ['done', 'skipped'].includes(statusOf(current, n.key))).length
    : 0;
  const running = current ? CHAIN.find((n) => statusOf(current, n.key) === 'running') : undefined;
  // "Running" means a run is unfinished AND has reported recently. Anything
  // else is idle or stalled; connectivity alone never counts as activity.
  const isRunning = (r: Run) => !r.finished && now - r.lastEventAt < STALE_MS;
  const activeCount = ordered.filter(isRunning).length;
  const stalledCount = ordered.filter((r) => !r.finished && !isRunning(r)).length;

  const health: Health = !live
    ? 'offline'
    : activeCount > 0
      ? 'running'
      : stalledCount > 0
        ? 'stalled'
        : 'idle';

  const label = (r: Run) => `${r.pr ? `PR #${r.pr}` : 'local'} · ${r.scenario}`;

  const runLink = current?.resources.find((r) => r.kind === 'run') ?? null;
  // Where the reviewer said it: its comment on the PR. The PR itself is the
  // fallback, since a link to roughly the right place beats none.
  const verdictLink =
    current?.resources.find((r) => r.kind === 'verdict')?.url ??
    (current?.pr && current.repo ? `https://github.com/${current.repo}/pull/${current.pr}` : null);

  // Wall clock for the whole run, still ticking while it works.
  const totalElapsed = current ? (current.endedAt ?? now) - current.startedAt : 0;

  /** How long a step took, or has been taking. */
  const stepElapsed = (run: Run, key: string): string | null => {
    const t = run.timings[key];
    if (!t) return null;
    const ms = (t.endedAt ?? now) - t.startedAt;
    // Sub-second means the step was reconciled from the log in one go rather
    // than watched, so a "0s" would be a measurement artefact, not a fact.
    return ms >= 1000 ? duration(ms) : null;
  };

  // The console's pinned line: which step is working, for how long, on what.
  // Only while the run is genuinely live — a stalled or finished run still
  // claiming to be "running" is exactly the lie the stall detector prevents.
  const activeLine =
    current && running && isRunning(current)
      ? `▸ step ${CHAIN.findIndex((n) => n.key === running.key) + 1}/${CHAIN.length} ` +
        `${running.title} — running` +
        `${stepElapsed(current, running.key) ? ` ${stepElapsed(current, running.key)}` : ''}` +
        `${
          current.agents[running.key]
            ? ` on ${current.agents[running.key].provider} ${shortModel(current.agents[running.key].model)}`
            : ''
        }`
      : null;

  if (view === 'hidden') {
    return (
      <button
        onClick={() => {
          userHid.current = false;
          setView('expanded');
        }}
        className="fixed bottom-5 right-5 z-40 bg-ink text-cream text-[12px] font-medium px-4 py-2.5 rounded-pill shadow-lift hover:bg-rose hover:text-ink transition-colors"
      >
        Factory {current ? `${doneCount}/${CHAIN.length}` : ''}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className={`mx-auto px-4 pb-4 ${size === 'large' ? 'max-w-[96rem]' : 'max-w-6xl'}`}>
        <div className="bg-white rounded-3xl shadow-lift overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3">
            <span
              className={[
                'w-2 h-2 rounded-pill shrink-0',
                health === 'running'
                  ? 'bg-rose animate-pulse'
                  : health === 'stalled'
                    ? 'bg-rose'
                    : health === 'idle'
                      ? 'bg-muted/50'
                      : 'border border-muted/50',
              ].join(' ')}
              aria-hidden
            />
            <span className="text-[12px] uppercase tracking-[0.16em] shrink-0">AutoFactory</span>
            {/* Say the state in words; a colour alone cannot distinguish
                "connected" from "working". */}
            <span className="text-[12px] text-muted shrink-0" title={HEALTH_TITLE[health]}>
              {health}
            </span>

            {/* One run per PR: pick which flow to show. */}
            {ordered.length > 0 ? (
              <select
                value={current?.id ?? ''}
                onChange={(e) => {
                  userPicked.current = true;
                  setSelected(e.target.value);
                  setView('expanded');
                }}
                className="bg-shell text-ink text-[13px] rounded-pill px-3 py-1.5 max-w-[260px] truncate focus:outline-none focus:ring-1 focus:ring-rose"
                aria-label="Select which PR's factory run to show"
              >
                {ordered.map((r) => (
                  <option key={r.id} value={r.id}>
                    {label(r)}
                    {r.finished ? '' : isRunning(r) ? ' (running)' : ' (stalled)'}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[13px] text-muted">waiting for a run</span>
            )}

            {/* PR deep link, only when the runner told us the repo slug. */}
            {current?.pr && current.repo && (
              <Link
                href={`https://github.com/${current.repo}/pull/${current.pr}`}
                className="text-[12px] text-muted hover:text-ink underline decoration-dotted underline-offset-2 shrink-0"
                title={`Open PR #${current.pr} on GitHub`}
              >
                PR #{current.pr} on GitHub
              </Link>
            )}

            {/* The Actions run, kept beside the PR rather than only in the
                footer: the terminal is the default panel, and its own links are
                the embedded terminal's to handle, not ours. */}
            {runLink && (
              <Link
                href={runLink.url}
                className="text-[12px] text-muted hover:text-ink underline decoration-dotted underline-offset-2 shrink-0"
                title="Open the GitHub Actions run"
              >
                run on GitHub
              </Link>
            )}

            {current?.provider && (
              <span className="text-[12px] text-muted shrink-0">via {current.provider}</span>
            )}

            {activeCount > 1 && (
              <span className="text-[12px] text-muted shrink-0">{activeCount} in flight</span>
            )}

            <button
              onClick={() => setView(view === 'expanded' ? 'collapsed' : 'expanded')}
              className="ml-auto flex items-center gap-2 text-[12px] text-muted hover:text-ink transition-colors shrink-0"
              aria-expanded={view === 'expanded'}
            >
              {current && (
                <span>
                  {running ? `${running.title} · ` : ''}
                  {doneCount}/{CHAIN.length}
                  {' · '}
                  <span
                    className="tabular-nums"
                    title={current.endedAt ? 'Total run time' : 'Elapsed so far'}
                  >
                    {duration(totalElapsed)}
                  </span>
                </span>
              )}
              <span aria-hidden>{view === 'expanded' ? '▾' : '▴'}</span>
            </button>

            <button
              onClick={() => setSize(size === 'large' ? 'normal' : 'large')}
              className="text-muted hover:text-ink text-[13px] shrink-0 transition-colors px-1"
              aria-label={size === 'large' ? 'Shrink the panel' : 'Enlarge the panel'}
              title={size === 'large' ? 'Shrink' : 'Enlarge for a demo'}
            >
              {size === 'large' ? '⤡' : '⤢'}
            </button>

            <button
              onClick={() => {
                userHid.current = true;
                setView('hidden');
              }}
              className="text-muted/70 hover:text-ink text-lg leading-none w-6 shrink-0 transition-colors"
              aria-label="Hide factory panel"
            >
              ×
            </button>
          </div>

          {view === 'expanded' && guided && (
            <div className="border-t border-hair px-5 pt-5">
              <PresenterExperience
                session={guided}
                run={current}
                now={now}
                onClose={() => setGuided(null)}
              />
            </div>
          )}

          {view === 'expanded' && current && (
            <div
              className={`${
                guided ? '' : 'border-t border-hair'
              } px-5 py-5 ${guided ? 'max-h-[48vh]' : 'max-h-[72vh]'} overflow-y-auto`}
            >
              <PipelineRail
                run={current}
                size={size}
                live={isRunning(current)}
                details={(key) => detailsFor(current, key)}
                elapsed={(key) => stepElapsed(current, key)}
              />

              {current.note && (
                <p
                  className={`mt-4 text-[12px] rounded-2xl px-4 py-2.5 ${
                    current.note.level === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}
                >
                  {/* Notes are error text from the runner, which regularly
                      carries the run or PR URL. */}
                  <Linkify text={current.note.text} className="underline underline-offset-2" />
                </p>
              )}

              {current.verdict && (
                <p
                  className={`mt-4 text-[12px] ${
                    current.verdict.approved ? 'text-muted' : 'text-red-800'
                  }`}
                >
                  review:{' '}
                  <span className={current.verdict.approved ? 'text-ink' : 'font-medium'}>
                    {current.verdict.approved ? 'approved' : 'rejected'}
                  </span>
                  {current.verdict.risk ? ` · risk ${current.verdict.risk}` : ''}
                  {/* A rejection is a talking point, so the reasoning has to be
                      one click away rather than somewhere in the PR. */}
                  {!current.verdict.approved && verdictLink && (
                    <>
                      {' · '}
                      <Link
                        href={verdictLink}
                        className="underline decoration-2 decoration-red-300 underline-offset-4 hover:text-red-900"
                        title="Open the reviewer's verdict on GitHub"
                      >
                        read the verdict
                      </Link>
                    </>
                  )}
                </p>
              )}

              {(current.resources.length > 0 || (current.pr && current.repo)) && (
                <div className="mt-4 pt-4 border-t border-hair flex flex-wrap items-center gap-x-5 gap-y-2">
                  {current.pr && current.repo && (
                    <Link
                      href={`https://github.com/${current.repo}/pull/${current.pr}`}
                      className="text-[13px] text-ink underline decoration-rose decoration-2 underline-offset-4 hover:text-rose transition-colors"
                    >
                      pr: #{current.pr}
                    </Link>
                  )}
                  {current.resources.map((r) => (
                    <Link
                      key={r.key}
                      href={r.url}
                      className="text-[13px] text-ink underline decoration-rose decoration-2 underline-offset-4 hover:text-rose transition-colors"
                    >
                      {r.kind}: {r.key}
                    </Link>
                  ))}
                </div>
              )}

              {(current.log.length > 0 || terminalUp) && (
                <div className="mt-4 pt-4 border-t border-hair">
                  <div className="flex items-center gap-4">
                    {(['console', 'terminal'] as const).map((p) =>
                      p === 'terminal' && !terminalUp ? null : (
                        <button
                          key={p}
                          onClick={() => {
                            userPickedPanel.current = true;
                            setPanel(p);
                            setShowPanel(true);
                          }}
                          className={`text-[11px] uppercase tracking-[0.16em] transition-colors ${
                            panel === p && showPanel ? 'text-ink' : 'text-muted hover:text-ink'
                          }`}
                        >
                          {p}
                        </button>
                      ),
                    )}
                    <button
                      onClick={() => setShowPanel(!showPanel)}
                      className="ml-auto text-[12px] text-muted hover:text-ink transition-colors"
                      aria-expanded={showPanel}
                    >
                      {showPanel ? '▾' : `▴ ${current.log.length} lines`}
                    </button>
                  </div>

                  {showPanel && (
                    <div className="mt-2">
                      {panel === 'terminal' && terminalUp ? (
                        <iframe
                          src={TERMINAL_URL}
                          title="Demo terminal"
                          className={`w-full rounded-2xl border border-hair bg-[#131010] ${
                            size === 'large' ? 'h-[26rem]' : 'h-56'
                          }`}
                        />
                      ) : (
                        <Console
                          lines={current.log}
                          tall={size === 'large'}
                          active={activeLine}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Always available while the pane is open, including when there are
              no runs left to show — after a reset, starting the next one is the
              only thing anybody wants to do. */}
          {view === 'expanded' && (
            <DemoControls
              onCleared={clearRuns}
              onRunStarted={showConsole}
              onGuidedRunStarted={startGuided}
              currentScenario={current?.scenario}
            />
          )}
        </div>
      </div>
    </div>
  );
}
