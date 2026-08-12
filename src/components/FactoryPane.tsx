'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

// Chain order matches phase1-cli's NODE_TITLES. The Cursor extension's panel
// omits manifest-steward; it is a real node, so it is included here.
const CHAIN: ReadonlyArray<{ key: string; title: string }> = [
  { key: 'autofactory-research-planner', title: 'Research & plan' },
  { key: 'autofactory-flag-implementer', title: 'Flag' },
  { key: 'autofactory-metrics-author', title: 'Metrics' },
  { key: 'autofactory-manifest-steward', title: 'Manifest' },
  { key: 'autofactory-flag-testing', title: 'Tests' },
  { key: 'autofactory-code-reviewer', title: 'Review' },
];

const MAX_RUNS = 12;

type Resource = { kind: string; key: string; url: string };

type Run = {
  id: string;
  scenario: string;
  pr: number | null;
  startedAt: number;
  finished: boolean;
  statuses: Record<string, Status>;
  /** Routing tags each node emitted — its claims (flag_key, metric_keys, ...). */
  tags: Record<string, Record<string, string>>;
  /** Which model ran each node, resolved from its LaunchDarkly AI config. */
  agents: Record<string, { provider: string; model: string }>;
  provider: string | null;
  resources: Resource[];
  note: { level: string; text: string } | null;
};

function emptyRun(id: string, scenario: string, at: number): Run {
  return {
    id,
    scenario,
    pr: null,
    startedAt: at,
    finished: false,
    statuses: {},
    tags: {},
    agents: {},
    provider: null,
    resources: [],
    note: null,
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

function detailsFor(run: Run, nodeKey: string): string[] {
  const out: string[] = [];

  const agent = run.agents[nodeKey];
  if (agent) out.push(shortModel(agent.model));

  const tags = run.tags[nodeKey] ?? {};
  for (const [k, label] of Object.entries(TAG_LABELS)) {
    const v = tags[k];
    if (!v) continue;
    const value = k === 'metric_keys' || k === 'metric_event_keys' ? v.split(',').map((x) => x.trim()).filter(Boolean).join(', ') : v;
    out.push(`${label}: ${value}`);
  }

  // Anything else the node claimed that is not already covered.
  for (const [k, v] of Object.entries(tags)) {
    if (out.length >= 4) break;
    if (k in TAG_LABELS || TAG_SKIP.has(k) || !v) continue;
    out.push(`${k.replace(/_/g, ' ')}: ${v}`);
  }

  return out.slice(0, 4);
}

export function FactoryPane() {
  const [view, setView] = useState<View>('collapsed');
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState(false);
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

        switch (m.t) {
          case 'run-start':
            // Replay after a log rotation re-sends run-start; keep accumulated
            // state rather than blanking a finished run.
            break;
          case 'pr':
            run.pr = typeof m.number === 'number' ? m.number : run.pr;
            break;
          case 'node':
            run.statuses = { ...run.statuses, [String(m.key)]: m.status as Status };
            if (m.tags && typeof m.tags === 'object') {
              run.tags = {
                ...run.tags,
                [String(m.key)]: { ...(run.tags[String(m.key)] ?? {}), ...(m.tags as Record<string, string>) },
              };
            }
            break;
          case 'agent':
            run.agents = {
              ...run.agents,
              [String(m.key)]: { provider: String(m.provider), model: String(m.model) },
            };
            break;
          case 'provider':
            run.provider = String(m.provider);
            break;
          case 'resource':
            if (!run.resources.some((r) => r.key === m.key)) {
              run.resources = [
                ...run.resources,
                { kind: String(m.kind), key: String(m.key), url: String(m.url) },
              ];
            }
            break;
          case 'note':
            run.note = { level: String(m.level), text: String(m.text) };
            break;
          case 'run-done':
            run.finished = true;
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

  // Newest first, so the dropdown reads like a PR list.
  const ordered = useMemo(
    () => Object.values(runs).sort((a, b) => b.startedAt - a.startedAt),
    [runs],
  );

  const current = (selected && runs[selected]) || ordered[0] || null;

  const statusOf = (run: Run, key: string): Status => run.statuses[key] ?? 'pending';
  const doneCount = current
    ? CHAIN.filter((n) => ['done', 'skipped'].includes(statusOf(current, n.key))).length
    : 0;
  const running = current ? CHAIN.find((n) => statusOf(current, n.key) === 'running') : undefined;
  const activeCount = ordered.filter((r) => !r.finished).length;

  const label = (r: Run) => `${r.pr ? `PR #${r.pr}` : 'local'} · ${r.scenario}`;

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
      <div className="mx-auto max-w-6xl px-4 pb-4">
        <div className="bg-white rounded-3xl shadow-lift overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3">
            <span
              className={`w-2 h-2 rounded-pill shrink-0 ${live ? 'bg-rose animate-pulse' : 'bg-hair'}`}
              aria-hidden
            />
            <span className="text-[12px] uppercase tracking-[0.16em] shrink-0">AutoFactory</span>

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
                    {r.finished ? '' : ' (running)'}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[13px] text-muted">waiting for a run</span>
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
                </span>
              )}
              <span aria-hidden>{view === 'expanded' ? '▾' : '▴'}</span>
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

          {view === 'expanded' && current && (
            <div className="border-t border-hair px-5 py-5">
              <ol className="flex items-center gap-0 overflow-x-auto pb-1">
                {CHAIN.map((node, i) => {
                  const st = statusOf(current, node.key);
                  const details = detailsFor(current, node.key);
                  const isLast = i === CHAIN.length - 1;
                  return (
                    <li key={node.key} className="flex items-stretch shrink-0">
                      <div
                        className={[
                          'rounded-2xl px-4 py-3 w-[178px] transition-colors self-stretch flex flex-col',
                          st === 'done'
                            ? 'bg-ink text-cream'
                            : st === 'running'
                              ? 'bg-blush text-ink ring-1 ring-rose'
                              : st === 'failed'
                                ? 'bg-red-50 text-red-800 ring-1 ring-red-300'
                                : 'bg-shell text-muted',
                        ].join(' ')}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[13px] font-medium leading-tight truncate">
                            {node.title}
                          </span>
                          <span className="text-[11px] leading-none shrink-0 opacity-80">
                            {st === 'done' && '✓'}
                            {st === 'running' && <span className="animate-pulse">•••</span>}
                            {st === 'failed' && '✕'}
                            {st === 'skipped' && '–'}
                            {st === 'pending' && <span className="opacity-50">○</span>}
                          </span>
                        </div>

                        {/* What this node actually did: model + emitted claims. */}
                        <div className="mt-2 space-y-0.5 text-left">
                          {details.length > 0 ? (
                            details.map((d) => (
                              <div
                                key={d}
                                className={`text-[10.5px] leading-snug truncate ${
                                  st === 'done' ? 'opacity-70' : 'opacity-90'
                                }`}
                                title={d}
                              >
                                {d}
                              </div>
                            ))
                          ) : (
                            <div className="text-[10.5px] leading-snug opacity-40">
                              {st === 'pending' ? 'queued' : st === 'running' ? 'working' : '—'}
                            </div>
                          )}
                        </div>
                      </div>

                      {!isLast && (
                        <div
                          className={`h-px w-6 mx-1 shrink-0 self-center ${
                            st === 'done' || st === 'skipped' ? 'bg-ink' : 'bg-hair'
                          }`}
                          aria-hidden
                        />
                      )}
                    </li>
                  );
                })}
              </ol>

              {current.note && (
                <p
                  className={`mt-4 text-[12px] rounded-2xl px-4 py-2.5 ${
                    current.note.level === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}
                >
                  {current.note.text}
                </p>
              )}

              {current.resources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-hair flex flex-wrap items-center gap-x-5 gap-y-2">
                  {current.resources.map((r) => (
                    <a
                      key={r.key}
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] text-ink underline decoration-rose decoration-2 underline-offset-4 hover:text-rose transition-colors"
                    >
                      {r.kind}: {r.key}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
