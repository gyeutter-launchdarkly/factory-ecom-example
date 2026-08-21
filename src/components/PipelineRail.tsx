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
  resourceLabel,
  resourcesForStation,
  stageStatus,
  type Detail,
  type Owner,
  type PipelineResource,
  type RunView,
  type Stage,
  type Status,
} from '@/lib/pipeline';

type Size = 'normal' | 'large';

type RailRun = RunView & {
  id: string;
  tags: Record<string, Record<string, string>>;
  agents: Record<string, { provider: string; model: string }>;
  resources: PipelineResource[];
};

const INTERCHANGES = new Set([CONTROL_PLANE, EVIDENCE_GATES, GUARDED_RELEASE]);
const SPUR_KINDS = new Set([
  'pr',
  'commits',
  'run',
  'local-run',
  'flag',
  'metric',
  'manifest',
  'verdict',
]);

const STATUS_LABEL: Record<Status, string> = {
  done: 'complete',
  running: 'running',
  failed: 'failed',
  skipped: 'not used in this run',
  pending: 'waiting',
  beyond: 'after this run',
};

function shortModel(model: string): string {
  const match = model.match(/(opus|sonnet|haiku|fable)-([0-9]+(?:-[0-9]+)?)/i);
  return match
    ? `${match[1].toLowerCase()}-${match[2]}`
    : model.replace(/^claude-/, '').slice(0, 24);
}
function statusGlyph(status: Status): string {
  if (status === 'done') return '✓';
  if (status === 'failed') return '×';
  if (status === 'skipped') return '–';
  if (status === 'beyond') return '›';
  return '';
}
function loopState(from: string, run: RailRun): 'idle' | 'taken' | 'stopped' {
  if (from === EVIDENCE_GATES) return checksFailed(run) ? 'stopped' : 'idle';
  if (from === REVIEWER) return run.statuses[REVIEWER] === 'failed' ? 'stopped' : 'idle';
  if (from === GUARDED_RELEASE) return 'idle';
  return Object.values(run.judges).some((judges) => judges.length > 0)
    ? 'taken'
    : 'idle';
}
function Legend() {
  return (
    <div className="metro-legend">
      {(Object.keys(OWNER_LABEL) as Owner[]).map((owner) => (
        <span key={owner} title={OWNER_TITLE[owner]}>
          <i className={`metro-legend-line ${OWNER_CLASS[owner]}`} aria-hidden />
          {OWNER_LABEL[owner]}
        </span>
      ))}
      <span title="Shown to explain what happens next; not executed by this run">
        <i className="metro-legend-beyond" aria-hidden />
        after this run
      </span>
      <span>
        <i className="metro-legend-spur" aria-hidden />
        inspectable evidence
      </span>
    </div>
  );
}
function stationExtra(stage: Stage, run: RailRun): string | null {
  if (stage.key !== CONTROL_PLANE) return null;
  const models = Array.from(
    new Set(Object.values(run.agents).map((agent) => shortModel(agent.model))),
  );
  if (models.length === 0) return null;
  return `${Object.keys(run.agents).length}/${AGENTS.length} configs · ${models.join(', ')}`;
}
function StationDrawer({
  stage,
  run,
  status,
  details,
  elapsed,
}: {
  stage: Stage;
  run: RailRun;
  status: Status;
  details: Detail[];
  elapsed: string | null;
}) {
  const resources = resourcesForStation(run.resources, stage.key);
  const agent = run.agents[stage.key];
  const judges = run.judges[stage.key] ?? [];
  const checks =
    stage.key === EVIDENCE_GATES
      ? Object.values(run.checks).flat()
      : run.checks[stage.key] ?? [];

  return (
    <section className={`metro-drawer ${OWNER_CLASS[stage.owner]}`} aria-live="polite">
      <div className="metro-drawer-summary">
        <div>
          <div className="metro-drawer-kicker">
            {OWNER_LABEL[stage.owner]} · {STATUS_LABEL[status]}
            {elapsed ? ` · ${elapsed}` : ''}
          </div>
          <h3>{stage.title}</h3>
          <p>{stage.blurb}</p>
        </div>
        {agent && (
          <div className="metro-model">
            <span>resolved model</span>
            <strong>{agent.provider} · {shortModel(agent.model)}</strong>
          </div>
        )}
      </div>

      <div className="metro-drawer-grid">
        {(stage.detail || stationExtra(stage, run) || details.length > 0) && (
          <div className="metro-drawer-section">
            <h4>What it produced</h4>
            {stage.detail && <p>{stage.detail}</p>}
            {stationExtra(stage, run) && <p>{stationExtra(stage, run)}</p>}
            {details
              .filter((detail) => !agent || detail.text !== shortModel(agent.model))
              .map((detail) =>
              detail.url ? (
                <Link key={detail.text} href={detail.url} title={`Open ${detail.text}`}>
                  {detail.text} ↗
                </Link>
              ) : (
                <p key={detail.text}>{detail.text}</p>
              ),
            )}
          </div>
        )}

        {(judges.length > 0 || checks.length > 0) && (
          <div className="metro-drawer-section">
            <h4>Evidence</h4>
            {judges.map((judge, index) => (
              <p key={`${judge.judge ?? 'judge'}-${index}`} title={judge.reasoning}>
                <span className="pill-ld">
                  judge {judge.score === null ? 'n/a' : judge.score.toFixed(2)}
                </span>{' '}
                {judge.judge ?? 'LaunchDarkly judge'}
              </p>
            ))}
            {checks.map((check) => (
              <p key={check.name} title={check.detail}>
                <span className={check.ok ? 'metro-check-ok' : 'metro-check-fail'}>
                  {check.ok ? '✓' : '×'}
                </span>{' '}
                {check.name}
              </p>
            ))}
          </div>
        )}

        <div className="metro-drawer-section metro-drawer-links">
          <h4>Open the evidence</h4>
          {resources.length > 0 ? (
            resources.map((resource) => (
              <Link
                key={`${resource.kind}-${resource.key}-${resource.url}`}
                href={resource.url}
                title={`Open ${resourceLabel(resource)}`}
              >
                {resourceLabel(resource)} <span aria-hidden>↗</span>
              </Link>
            ))
          ) : (
            <p className="text-muted">No external artifact for this station yet.</p>
          )}
        </div>
      </div>
    </section>
  );
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
  live: boolean;
  details: (key: string) => Detail[];
  elapsed: (key: string) => string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const route = useRef<HTMLDivElement>(null);
  const stations = useRef(new Map<string, HTMLButtonElement>());
  const [arcs, setArcs] = useState<
    { from: number; to: number; depth: number; label: string; key: string }[]
  >([]);
  const [routeWidth, setRouteWidth] = useState(0);

  const focus =
    PIPELINE.find((stage) => run.statuses[stage.key] === 'running')?.key ??
    (run.statuses[REVIEWER] === 'failed' ? REVIEWER : undefined) ??
    PIPELINE.find((stage) => stageStatus(stage, run) === 'failed')?.key ??
    (!run.finished
      ? AGENTS.find(
          (stage) => !['done', 'skipped'].includes(run.statuses[stage.key] ?? ''),
        )?.key
      : undefined) ??
    REVIEWER;
  const [selected, setSelected] = useState(focus);
  const selectedStage =
    PIPELINE.find((stage) => stage.key === selected) ??
    PIPELINE.find((stage) => stage.key === focus) ??
    PIPELINE[0];

  useEffect(() => setSelected(focus), [focus, run.id]);

  const measure = useCallback(() => {
    const root = route.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const center = (key: string) => {
      const station = stations.current.get(key);
      if (!station) return null;
      const box = station.getBoundingClientRect();
      return box.left - base.left + box.width / 2;
    };
    setArcs(
      LOOPS.flatMap((loop) => {
        const from = center(loop.from);
        const to = center(loop.to);
        return from === null || to === null
          ? []
          : [{
              from,
              to,
              depth: loop.depth,
              label: loop.label,
              key: `${loop.from}->${loop.to}`,
            }];
      }),
    );
    setRouteWidth(base.width);
  }, []);

  useEffect(() => {
    measure();
    const root = route.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure, size, run.statuses, run.resources]);

  useEffect(() => {
    const box = scroller.current;
    const station = stations.current.get(selected);
    if (!box || !station) return;
    const stop = station.parentElement;
    const center = (stop?.offsetLeft ?? 0) + station.offsetLeft + station.offsetWidth / 2;
    const left = center - box.clientWidth / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [selected, size]);

  const selectedStatus = stageStatus(selectedStage, run);
  const selectedDetails = details(selectedStage.key);
  const selectedElapsed = elapsed(selectedStage.key);

  const stationWidth = size === 'large' ? 156 : 124;
  const arcStep = size === 'large' ? 20 : 17;
  const arcHeight = arcs.length
    ? Math.max(...arcs.map((arc) => arc.depth)) * arcStep + 20
    : 0;

  const selectByKey = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = Math.min(PIPELINE.length - 1, index + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = PIPELINE.length - 1;
    else return;
    event.preventDefault();
    setSelected(PIPELINE[next].key);
    stations.current.get(PIPELINE[next].key)?.focus();
  };

  return (
    <div className="metro">
      <div ref={scroller} className="metro-scroll">
        <div
          ref={route}
          className="metro-route"
          style={{
            width: PIPELINE.length * stationWidth,
            height: 148 + arcHeight,
          }}
        >
          {PIPELINE.map((stage, index) => {
            const status = stageStatus(stage, run);
            const stationResources = resourcesForStation(run.resources, stage.key);
            const spur = stationResources.find((resource) => SPUR_KINDS.has(resource.kind));
            const alternate = index % 2 === 1;
            return (
              <div
                key={stage.key}
                className={`metro-stop ${alternate ? 'metro-stop-below' : 'metro-stop-above'}`}
                style={{ width: stationWidth }}
              >
                {index < PIPELINE.length - 1 && (
                  <i
                    className={`metro-track ${OWNER_CLASS[stage.owner]} ${
                      status === 'beyond' ? 'metro-track-beyond' : ''
                    }`}
                    aria-hidden
                  />
                )}

                <button
                  ref={(element) => {
                    if (element) stations.current.set(stage.key, element);
                    else stations.current.delete(stage.key);
                  }}
                  type="button"
                  className={[
                    'metro-station',
                    OWNER_CLASS[stage.owner],
                    `metro-status-${status}`,
                    INTERCHANGES.has(stage.key) ? 'metro-interchange' : '',
                    selected === stage.key ? 'metro-station-selected' : '',
                    status === 'running' && live ? 'metro-station-live' : '',
                  ].join(' ')}
                  onClick={() => setSelected(stage.key)}
                  onKeyDown={(event) => selectByKey(event, index)}
                  aria-label={`${stage.title}: ${STATUS_LABEL[status]}`}
                  aria-pressed={selected === stage.key}
                  title={`${stage.title} · ${OWNER_LABEL[stage.owner]} · ${STATUS_LABEL[status]}`}
                >
                  <span aria-hidden>{statusGlyph(status)}</span>
                </button>

                <button
                  type="button"
                  className="metro-stop-label"
                  onClick={() => setSelected(stage.key)}
                  tabIndex={-1}
                  aria-hidden
                >
                  <strong>{stage.title}</strong>
                  <span>
                    {elapsed(stage.key) ??
                      (status === 'running'
                        ? 'running'
                        : status === 'beyond'
                          ? 'next'
                          : '')}
                  </span>
                </button>

                {spur && (
                  <Link
                    href={spur.url}
                    className="metro-spur"
                    title={`Open ${resourceLabel(spur)}`}
                  >
                    <i aria-hidden />
                    <span>{resourceLabel(spur)}</span>
                  </Link>
                )}
              </div>
            );
          })}

          {arcHeight > 0 && (
            <svg
              width={routeWidth}
              height={arcHeight}
              className="metro-loops"
              aria-label="Factory feedback routes"
            >
              <defs>
                {(['loop-head', 'loop-head-taken', 'loop-head-stopped'] as const).map(
                  (id) => (
                    <marker
                      key={id}
                      id={id}
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L6,3 L0,6 z" className={id} />
                    </marker>
                  ),
                )}
              </defs>
              {arcs.map((arc) => {
                const drop = arc.depth * arcStep;
                const state = loopState(arc.key.split('->')[0], run);
                const head =
                  state === 'stopped'
                    ? 'loop-head-stopped'
                    : state === 'taken'
                      ? 'loop-head-taken'
                      : 'loop-head';
                return (
                  <g key={arc.key}>
                    <path
                      d={`M ${arc.from} 1 C ${arc.from} ${drop + 10}, ${arc.to} ${drop + 10}, ${arc.to} 5`}
                      className={`loop-arc loop-arc-${state}`}
                      markerEnd={`url(#${head})`}
                    />
                    <text
                      x={(arc.from + arc.to) / 2}
                      y={drop + 12}
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

      <Legend />
      <StationDrawer
        stage={selectedStage}
        run={run}
        status={selectedStatus}
        details={selectedDetails}
        elapsed={selectedElapsed}
      />
    </div>
  );
}
