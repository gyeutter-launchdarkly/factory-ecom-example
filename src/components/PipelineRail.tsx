'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from './links';
import {
  AGENTS,
  CONTROL_PLANE,
  EVIDENCE_GATES,
  GUARDED_RELEASE,
  LOOPS,
  OWNER_CLASS,
  OWNER_LABEL,
  OWNER_TITLE,
  PIPELINE,
  REVIEWER,
  checksFailed,
  stageStatus,
  type Detail,
  type Owner,
  type RunView,
  type Status,
} from '@/lib/pipeline';

/**
 * The run, drawn as one lane from request to released.
 *
 * Two encodings, deliberately separate. Colour of the card fill is status, as
 * it always was: green done, blue running, grey waiting, red failed. Colour of
 * the rule along the top is ownership, so the answer to "what is LaunchDarkly
 * actually adding here" is legible at a glance instead of being a claim in the
 * voiceover. Overloading one channel with both would make neither readable.
 */

type Size = 'normal' | 'large';

/** What the run knows, plus the pane's own time-aware helpers. */
type RailRun = RunView & {
  tags: Record<string, Record<string, string>>;
  agents: Record<string, { provider: string; model: string }>;
};

const STATUS_CLASS: Record<Status, string> = {
  done: 'step-done',
  running: 'step-running',
  failed: 'step-failed',
  skipped: 'step-todo',
  pending: 'step-todo',
  beyond: 'step-beyond',
};

/** Vertical room each loop's arc gets, deepest last so spans do not collide. */
const ARC_STEP = { normal: 13, large: 16 };

function shortModel(model: string): string {
  const m = model.match(/(opus|sonnet|haiku|fable)-([0-9]+(?:-[0-9]+)?)/i);
  return m ? `${m[1].toLowerCase()}-${m[2]}` : model.replace(/^claude-/, '').slice(0, 18);
}

/**
 * Whether a loop was exercised, and whether that was a stop.
 *
 * The distinction matters on screen: red is the colour of a run that did not
 * ship, so the judge loop firing — which is the platform working normally —
 * must not borrow it.
 */
function loopState(from: string, run: RailRun): 'idle' | 'taken' | 'stopped' {
  switch (from) {
    case EVIDENCE_GATES:
      return checksFailed(run) ? 'stopped' : 'idle';
    case REVIEWER:
      return run.statuses[REVIEWER] === 'failed' ? 'stopped' : 'idle';
    case GUARDED_RELEASE:
      // Nothing in this run reaches a release, so it is never lit.
      return 'idle';
    default:
      // The judge loop: lit once the platform has scored something.
      return Object.values(run.judges).some((list) => list.length > 0) ? 'taken' : 'idle';
  }
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted">
      {(Object.keys(OWNER_LABEL) as Owner[]).map((owner) => (
        <span key={owner} className="flex items-center gap-1.5" title={OWNER_TITLE[owner]}>
          <span className={`w-3.5 h-[3px] rounded-pill own-swatch ${OWNER_CLASS[owner]}`} aria-hidden />
          {OWNER_LABEL[owner]}
        </span>
      ))}
      <span className="flex items-center gap-1.5" title="Drawn so the model is explainable; not executed by this run">
        <span className="w-3.5 h-3 rounded-[3px] border border-dashed border-muted/60" aria-hidden />
        after this run
      </span>
    </div>
  );
}

/** Small facts a non-agent stage can state from what the run produced. */
function stageExtra(key: string, run: RailRun): string | null {
  if (key === CONTROL_PLANE) {
    const models = Array.from(new Set(Object.values(run.agents).map((a) => shortModel(a.model))));
    const governed = Object.keys(run.agents).length;
    if (!governed) return null;
    return `${governed} of ${AGENTS.length} resolved · ${models.join(', ')}`;
  }
  if (key === GUARDED_RELEASE) {
    const flag = Object.values(run.tags).find((tags) => tags.flag_key)?.flag_key;
    return flag ? `would ramp ${flag}` : null;
  }
  return null;
}

export function PipelineRail({
  run,
  size,
  live,
  details,
  elapsed,
}: {
  run: RailRun;
  size: Size;
  /** Whether the run is genuinely reporting, so only then does anything pulse. */
  live: boolean;
  /** Per-agent claims and links, computed by the pane (it owns tag vocabulary). */
  details: (key: string) => Detail[];
  /** Per-stage elapsed time, which needs the pane's ticking clock. */
  elapsed: (key: string) => string | null;
}) {
  const cards = useRef(new Map<string, HTMLElement>());
  const content = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [arcs, setArcs] = useState<{ from: number; to: number; depth: number; label: string; key: string }[]>([]);
  const [width, setWidth] = useState(0);

  // Arcs are measured rather than computed from an index, because card widths
  // differ with content and the rail scrolls: an arc drawn from arithmetic
  // drifts off its endpoints as soon as a step reports a long flag key.
  const measure = useCallback(() => {
    const root = content.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const centerOf = (key: string) => {
      const el = cards.current.get(key);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return box.left - base.left + box.width / 2;
    };
    const next = [];
    for (const loop of LOOPS) {
      const from = centerOf(loop.from);
      const to = centerOf(loop.to);
      if (from === null || to === null) continue;
      next.push({ from, to, depth: loop.depth, label: loop.label, key: `${loop.from}->${loop.to}` });
    }
    setArcs(next);
    setWidth(base.width);
  }, []);

  useEffect(() => {
    measure();
    const root = content.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure, size, run.statuses, run.tags]);

  const arcHeight = arcs.length
    ? Math.max(...arcs.map((a) => a.depth)) * ARC_STEP[size] + 18
    : 0;

  // Seventeen stages do not fit a laptop, and the ones worth watching are in the
  // middle. So the rail follows the run: it centres whatever is working, and
  // when nothing is, the next thing to happen — never the request, which is the
  // one card nobody needs to look at.
  const focus =
    PIPELINE.find((stage) => run.statuses[stage.key] === 'running')?.key ??
    AGENTS.find((stage) => !['done', 'skipped'].includes(run.statuses[stage.key] ?? ''))?.key ??
    REVIEWER;

  useEffect(() => {
    const box = scroller.current;
    const card = cards.current.get(focus);
    if (!box || !card) return;
    const left = card.offsetLeft - (box.clientWidth - card.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [focus, size]);

  return (
    <div>
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div ref={content} className="relative min-w-max">
          <ol className="flex items-start gap-0">
            {PIPELINE.map((stage, i) => {
              const status = stageStatus(stage, run);
              const isAgent = stage.kind === 'agent';
              const lines = isAgent ? details(stage.key) : [];
              const took = isAgent ? elapsed(stage.key) : null;
              const judges = run.judges[stage.key] ?? [];
              const checks = isAgent ? run.checks[stage.key] ?? [] : [];
              const extra = isAgent ? null : stageExtra(stage.key, run);
              const gateChecks =
                stage.key === EVIDENCE_GATES ? Object.values(run.checks).flat() : [];

              return (
                <li key={stage.key} className="flex items-start shrink-0">
                  <div
                    ref={(el) => {
                      if (el) cards.current.set(stage.key, el);
                      else cards.current.delete(stage.key);
                    }}
                    className={`stage-card rounded-2xl transition-colors flex flex-col ${
                      OWNER_CLASS[stage.owner]
                    } ${STATUS_CLASS[status]} ${
                      // An agent card carries live claims and links, so it needs
                      // the room; a stage card is a name and who provides it.
                      isAgent
                        ? size === 'large'
                          ? 'px-5 py-4 w-[212px]'
                          : 'px-3.5 py-3 w-[164px]'
                        : size === 'large'
                          ? 'px-4 py-4 w-[176px]'
                          : 'px-3 py-3 w-[148px]'
                    }`}
                    title={OWNER_TITLE[stage.owner]}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      {/* Wraps rather than truncates: "Evidence gates" is the
                          card whose name carries the most weight, and it is the
                          one that would lose its last word. */}
                      <span
                        className={`font-medium leading-tight ${
                          size === 'large' ? 'text-[17px]' : 'text-[13px]'
                        }`}
                      >
                        {stage.title}
                      </span>
                      <span className="text-[11px] leading-none shrink-0 opacity-80 flex items-baseline gap-1.5">
                        {took && <span className="tabular-nums opacity-70">{took}</span>}
                        {status === 'done' && '✓'}
                        {status === 'running' && (
                          <span className={live ? 'animate-pulse font-medium' : 'font-medium'}>
                            running
                          </span>
                        )}
                        {status === 'failed' && '✕'}
                        {status === 'skipped' && '–'}
                        {status === 'pending' && <span className="opacity-50">○</span>}
                        {status === 'beyond' && <span className="opacity-60">next</span>}
                      </span>
                    </div>

                    <div
                      className={`mt-0.5 opacity-60 leading-snug ${
                        size === 'large' ? 'text-[12px]' : 'text-[10px]'
                      }`}
                    >
                      {stage.blurb}
                    </div>

                    <div className="mt-2 space-y-0.5 text-left">
                      {/* Non-agent stages state who provides them; the whole
                          point of the rail is that this is answerable. */}
                      {stage.detail && (
                        <div className="text-[10.5px] leading-snug opacity-70 truncate">
                          {stage.detail}
                        </div>
                      )}
                      {extra && (
                        <div className="text-[10.5px] leading-snug opacity-80 truncate" title={extra}>
                          {extra}
                        </div>
                      )}

                      {gateChecks.slice(0, 3).map((check) => (
                        <div
                          key={check.name}
                          className="text-[10.5px] leading-snug truncate opacity-80"
                          title={check.detail ?? check.name}
                        >
                          {check.ok ? '✓' : '✕'} {check.name}
                        </div>
                      ))}

                      {lines.map((line) =>
                        line.url ? (
                          <Link
                            key={line.text}
                            href={line.url}
                            className="block text-[10.5px] leading-snug truncate underline decoration-dotted underline-offset-2 hover:decoration-solid"
                            title={`${line.text} — open in LaunchDarkly`}
                          >
                            {line.text}
                          </Link>
                        ) : (
                          <div
                            key={line.text}
                            className={`leading-snug truncate opacity-80 ${
                              size === 'large' ? 'text-[12.5px]' : 'text-[10.5px]'
                            }`}
                            title={line.text}
                          >
                            {line.text}
                          </div>
                        ),
                      )}

                      {isAgent && lines.length === 0 && !extra && (
                        <div className="text-[10.5px] leading-snug opacity-50">
                          {status === 'pending' ? 'queued' : status === 'running' ? 'working' : '—'}
                        </div>
                      )}
                    </div>

                    {/* Evidence the platform and the gates produced about this
                        step, which is the difference between "the workflow was
                        green" and "the claim was checked". */}
                    {(judges.length > 0 || checks.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {judges.map((judge) => (
                          <span
                            key={judge.judge ?? 'score'}
                            className="pill-ld"
                            title={[
                              judge.judge ? `LaunchDarkly judge: ${judge.judge}` : 'LaunchDarkly judge',
                              judge.reasoning,
                            ]
                              .filter(Boolean)
                              .join(' — ')}
                          >
                            judge {judge.score === null ? 'n/a' : judge.score.toFixed(2)}
                          </span>
                        ))}
                        {checks.length > 0 && (
                          <span
                            // A failed gate is the run's outcome, so its pill
                            // cannot read as one more thing that went fine.
                            className={checks.every((c) => c.ok) ? 'pill-af' : 'pill-fail'}
                            title={checks
                              .map((c) => `${c.ok ? '✓' : '✕'} ${c.name}: ${c.detail ?? ''}`)
                              .join('\n')}
                          >
                            {checks.every((c) => c.ok)
                              ? `✓ ${checks.length} check${checks.length === 1 ? '' : 's'}`
                              : '✕ check failed'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {i < PIPELINE.length - 1 && (
                    <div
                      className={`h-px shrink-0 ${size === 'large' ? 'w-6 mx-1.5 mt-8' : 'w-4 mx-1 mt-7'} ${
                        status === 'done' || status === 'skipped' ? 'step-line-done' : 'step-line-todo'
                      }`}
                      aria-hidden
                    />
                  )}
                </li>
              );
            })}
          </ol>

          {/* The return paths. Every one of these exists today; the loop a
              customer will ask about — a judge score automatically sending work
              back to the coding agent — is absent because judges are sampled and
              non-blocking, and the honest version of it runs through the control
              plane into the next run. */}
          {arcHeight > 0 && (
            <svg
              width={width}
              height={arcHeight}
              className="block"
              aria-hidden
              focusable="false"
            >
              <defs>
                {(['loop-head', 'loop-head-taken', 'loop-head-stopped'] as const).map((id) => (
                  <marker key={id} id={id} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" className={id} />
                  </marker>
                ))}
              </defs>
              {arcs.map((arc) => {
                const drop = arc.depth * ARC_STEP[size];
                const state = loopState(arc.key.split('->')[0], run);
                const head =
                  state === 'stopped' ? 'loop-head-stopped' : state === 'taken' ? 'loop-head-taken' : 'loop-head';
                return (
                  <g key={arc.key}>
                    <path
                      d={`M ${arc.from} 0 C ${arc.from} ${drop + 12}, ${arc.to} ${drop + 12}, ${arc.to} 4`}
                      className={`loop-arc loop-arc-${state}`}
                      markerEnd={`url(#${head})`}
                    />
                    <text
                      x={(arc.from + arc.to) / 2}
                      y={drop + 13}
                      textAnchor="middle"
                      className={`loop-label loop-label-${state}`}
                    >
                      {arc.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Legend />
      </div>
    </div>
  );
}
