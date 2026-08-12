'use client';

import { useEffect, useRef, useState } from 'react';

// Live AutoFactory flowchart, docked to the bottom of the page. Subscribes to
// /api/factory-progress (SSE, fed by demo/lib/progress-tap.mjs) and renders the
// agent chain left to right: completed steps filled, the running step accented,
// the rest outlined.
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

type Resource = { kind: string; key: string; url: string };

export function FactoryPane() {
  const [view, setView] = useState<View>('collapsed');
  const [scenario, setScenario] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [resources, setResources] = useState<Resource[]>([]);
  const [verdict, setVerdict] = useState<{ approved: boolean; risk: string | null } | null>(null);
  const [note, setNote] = useState<{ level: string; text: string } | null>(null);
  const [live, setLive] = useState(false);
  // Respect a manual hide: a new run should not yank the pane back open.
  const userHid = useRef(false);

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

      switch (m.t) {
        case 'run-start':
          setScenario(String(m.scenario ?? ''));
          setStatuses({});
          setResources([]);
          setVerdict(null);
          setNote(null);
          if (!userHid.current) setView('expanded');
          break;
        case 'node':
          setStatuses((s) => ({ ...s, [String(m.key)]: m.status as Status }));
          break;
        case 'resource':
          setResources((r) =>
            r.some((x) => x.key === m.key)
              ? r
              : [...r, { kind: String(m.kind), key: String(m.key), url: String(m.url) }],
          );
          break;
        case 'verdict':
          setVerdict({ approved: Boolean(m.approved), risk: (m.risk as string) ?? null });
          break;
        case 'note':
          setNote({ level: String(m.level), text: String(m.text) });
          break;
      }
    };

    return () => es.close();
  }, []);

  const statusOf = (key: string): Status => statuses[key] ?? 'pending';
  const doneCount = CHAIN.filter((n) => ['done', 'skipped'].includes(statusOf(n.key))).length;
  const running = CHAIN.find((n) => statusOf(n.key) === 'running');

  // Fully hidden: leave a single unobtrusive pill to bring it back.
  if (view === 'hidden') {
    return (
      <button
        onClick={() => {
          userHid.current = false;
          setView('expanded');
        }}
        className="fixed bottom-5 right-5 z-40 bg-ink text-cream text-[12px] font-medium px-4 py-2.5 rounded-pill shadow-lift hover:bg-rose hover:text-ink transition-colors"
      >
        Factory {doneCount > 0 ? `${doneCount}/${CHAIN.length}` : ''}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="mx-auto max-w-6xl px-4 pb-4">
        <div className="bg-white rounded-3xl shadow-lift border border-hair overflow-hidden">
          {/* Summary bar: always visible, doubles as the expand/collapse control. */}
          <div className="flex items-center gap-3 px-5 py-3">
            <button
              onClick={() => setView(view === 'expanded' ? 'collapsed' : 'expanded')}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              aria-expanded={view === 'expanded'}
            >
              <span
                className={`w-2 h-2 rounded-pill shrink-0 ${
                  live ? 'bg-rose animate-pulse' : 'bg-hair'
                }`}
                aria-hidden
              />
              <span className="text-[12px] uppercase tracking-[0.16em] shrink-0">AutoFactory</span>
              <span className="text-[13px] text-muted truncate">
                {scenario ?? 'waiting for a run'}
                {running ? ` · ${running.title}` : ''}
              </span>
              <span className="ml-auto text-[12px] text-muted shrink-0 pr-1">
                {doneCount}/{CHAIN.length}
              </span>
              <span className="text-muted text-[11px] shrink-0" aria-hidden>
                {view === 'expanded' ? '▾' : '▴'}
              </span>
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

          {view === 'expanded' && (
            <div className="border-t border-hair px-5 py-5">
              {/* Horizontal flowchart; scrolls rather than wraps on narrow screens. */}
              <ol className="flex items-center gap-0 overflow-x-auto pb-1">
                {CHAIN.map((node, i) => {
                  const st = statusOf(node.key);
                  const isLast = i === CHAIN.length - 1;
                  return (
                    <li key={node.key} className="flex items-center shrink-0">
                      <div
                        className={[
                          'rounded-2xl px-4 py-3 min-w-[116px] text-center transition-colors',
                          st === 'done'
                            ? 'bg-ink text-cream'
                            : st === 'running'
                              ? 'bg-blush text-ink ring-1 ring-rose'
                              : st === 'failed'
                                ? 'bg-red-50 text-red-800 ring-1 ring-red-300'
                                : 'bg-shell text-muted',
                        ].join(' ')}
                      >
                        <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
                          {node.title}
                        </div>
                        <div className="text-[11px] mt-1 leading-none">
                          {st === 'done' && '✓'}
                          {st === 'running' && <span className="animate-pulse">running</span>}
                          {st === 'failed' && '✕'}
                          {st === 'skipped' && 'skipped'}
                          {st === 'pending' && <span className="opacity-50">–</span>}
                        </div>
                      </div>

                      {!isLast && (
                        <div
                          className={`h-px w-6 mx-1 shrink-0 ${
                            st === 'done' || st === 'skipped' ? 'bg-ink' : 'bg-hair'
                          }`}
                          aria-hidden
                        />
                      )}
                    </li>
                  );
                })}
              </ol>

              {note && (
                <p
                  className={`mt-4 text-[12px] rounded-2xl px-4 py-2.5 ${
                    note.level === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}
                >
                  {note.text}
                </p>
              )}

              {(resources.length > 0 || verdict) && (
                <div className="mt-4 pt-4 border-t border-hair flex flex-wrap items-center gap-x-5 gap-y-2">
                  {resources.map((r) => (
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
                  {verdict && (
                    <span className="text-[13px] text-muted ml-auto">
                      {verdict.approved ? 'Review approved' : 'Changes requested'}
                      {verdict.risk ? ` · risk ${verdict.risk}` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
