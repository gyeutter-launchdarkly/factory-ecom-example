'use client';

import { useEffect, useRef, useState } from 'react';

// Live AutoFactory flowchart. Subscribes to /api/factory-progress (SSE, fed by
// demo/lib/progress-tap.mjs) and renders the agent chain as a flowchart:
// completed steps filled, the running step accented, the rest outlined.

type Status = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

// Chain order matches phase1-cli's NODE_TITLES. The Cursor extension's panel
// omits manifest-steward; it is a real node, so it is included here.
const CHAIN: ReadonlyArray<{ key: string; title: string; blurb: string }> = [
  { key: 'autofactory-research-planner', title: 'Research & plan', blurb: 'classify change, blast radius' },
  { key: 'autofactory-flag-implementer', title: 'Flag', blurb: 'create flag, wire the code' },
  { key: 'autofactory-metrics-author', title: 'Metrics', blurb: 'guarded-release instrumentation' },
  { key: 'autofactory-manifest-steward', title: 'Release manifest', blurb: 'record release intent' },
  { key: 'autofactory-flag-testing', title: 'Tests', blurb: 'flag-on / flag-off' },
  { key: 'autofactory-code-reviewer', title: 'Review', blurb: 'verdict + risk level' },
];

type Resource = { kind: string; key: string; url: string };

export function FactoryPane() {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [resources, setResources] = useState<Resource[]>([]);
  const [verdict, setVerdict] = useState<{ approved: boolean; risk: string | null } | null>(null);
  const [note, setNote] = useState<{ level: string; text: string } | null>(null);
  const [live, setLive] = useState(false);
  // Auto-open on the first run of the session, but never fight a manual close.
  const userClosed = useRef(false);

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
          if (!userClosed.current) setOpen(true);
          break;
        case 'node':
          setStatuses((s) => ({ ...s, [String(m.key)]: m.status as Status }));
          break;
        case 'resource':
          setResources((r) =>
            r.some((x) => x.key === m.key) ? r : [...r, { kind: String(m.kind), key: String(m.key), url: String(m.url) }],
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
  const runningIdx = CHAIN.findIndex((n) => statusOf(n.key) === 'running');
  const doneCount = CHAIN.filter((n) => ['done', 'skipped'].includes(statusOf(n.key))).length;

  return (
    <>
      {/* Toggle. Always available so the pane can be shown before a run starts. */}
      <button
        onClick={() => {
          setOpen((o) => {
            if (o) userClosed.current = true;
            return !o;
          });
        }}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 border-2 border-[#0a0a0a] border-r-0 bg-white px-2 py-4 text-[10px] font-bold uppercase tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors"
        style={{ writingMode: 'vertical-rl' }}
        aria-label="Toggle AutoFactory panel"
      >
        Factory {doneCount > 0 ? `${doneCount}/${CHAIN.length}` : ''}
      </button>

      <aside
        className={`fixed right-0 top-0 h-full w-[340px] z-40 bg-white border-l-2 border-[#0a0a0a] overflow-y-auto transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-b-2 border-[#0a0a0a] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em]">AutoFactory</span>
            <span className={`text-[10px] font-mono ${live ? 'text-[#005AFF]' : 'text-neutral-400'}`}>
              {live ? '● live' : '○ idle'}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-neutral-500">
            {scenario ? scenario : 'waiting for a run'}
          </div>
        </div>

        <ol className="px-4 py-4">
          {CHAIN.map((node, i) => {
            const st = statusOf(node.key);
            const isLast = i === CHAIN.length - 1;
            return (
              <li key={node.key} className="relative">
                <div
                  className={[
                    'border-2 p-3 transition-colors',
                    st === 'done'
                      ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white'
                      : st === 'running'
                        ? 'border-[#005AFF] bg-[#005AFF]/5'
                        : st === 'failed'
                          ? 'border-red-600 bg-red-50'
                          : st === 'skipped'
                            ? 'border-dashed border-neutral-300 text-neutral-400'
                            : 'border-dashed border-neutral-300 text-neutral-400',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-wider truncate">
                        {node.title}
                      </div>
                      <div
                        className={`text-[10px] leading-tight mt-0.5 ${
                          st === 'done' ? 'text-neutral-300' : 'text-neutral-400'
                        }`}
                      >
                        {node.blurb}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] shrink-0">
                      {st === 'done' && '✓'}
                      {st === 'running' && <span className="text-[#005AFF] animate-pulse">●</span>}
                      {st === 'failed' && <span className="text-red-600">✕</span>}
                      {st === 'skipped' && '–'}
                      {st === 'pending' && <span className="text-neutral-300">○</span>}
                    </span>
                  </div>
                </div>

                {/* Flowchart connector: solid once the step above has completed. */}
                {!isLast && (
                  <div className="flex justify-center py-1" aria-hidden>
                    <div
                      className={`w-0.5 h-4 ${
                        st === 'done' || st === 'skipped'
                          ? 'bg-[#0a0a0a]'
                          : i === runningIdx
                            ? 'bg-[#005AFF]'
                            : 'bg-neutral-200'
                      }`}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {note && (
          <div
            className={`mx-4 mb-4 border-2 p-2 text-[10px] font-mono ${
              note.level === 'error' ? 'border-red-600 bg-red-50 text-red-800' : 'border-amber-500 bg-amber-50 text-amber-900'
            }`}
          >
            {note.text}
          </div>
        )}

        {resources.length > 0 && (
          <div className="border-t-2 border-[#0a0a0a] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2">Created in LaunchDarkly</div>
            {resources.map((r) => (
              <a
                key={r.key}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="block font-mono text-[11px] text-[#005AFF] hover:underline truncate"
              >
                {r.kind}: {r.key}
              </a>
            ))}
          </div>
        )}

        {verdict && (
          <div className="border-t-2 border-[#0a0a0a] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest">Review</div>
            <div className="mt-1 font-mono text-[11px]">
              {verdict.approved ? '✓ approved' : '✕ changes requested'}
              {verdict.risk ? ` · risk: ${verdict.risk}` : ''}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
