'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from './links';
import {
  resourcesForStation,
  resourceLabel,
  type Detail,
  type PipelineResource,
  type RunView,
} from '@/lib/pipeline';
import {
  JOURNEY,
  JOURNEY_STEPS,
  JOURNEY_STATUS_LABEL,
  journeyStatus,
  orderedJourneyStatuses,
} from '@/lib/journey';

type RailRun = RunView & {
  id: string;
  tags: Record<string, Record<string, string>>;
  agents: Record<string, { provider: string; model: string }>;
};

export function PipelineRail({
  run,
  size,
  live,
  details,
  elapsed,
}: {
  run: RailRun;
  size: 'normal' | 'large';
  live: boolean;
  details: (key: string) => Detail[];
  elapsed: (key: string) => string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => setSelected(null), [run.id]);
  const ordered = orderedJourneyStatuses(run);
  const linksFor = (item: (typeof JOURNEY_STEPS)[number]) =>
    Array.from(
      new Map(
        item.sources
          .flatMap((key) => resourcesForStation(run.resources, key))
          .map((r) => [r.url, r]),
      ).values(),
    );
  const step = JOURNEY_STEPS.find((item) => item.key === selected);
  const resources: PipelineResource[] = step
    ? Array.from(
        new Map(
          step.sources
            .flatMap((key) => resourcesForStation(run.resources, key))
            .map((resource) => [resource.url, resource]),
        ).values(),
      )
    : [];
  const referenceFor = (key: string) => {
    const paths: Record<string, string> = {
      'write-plan': 'demo/ci/events',
      'write-design': 'src/components',
      'write-code': 'src',
      'write-review': 'demo/ci',
      'write-validate': 'e2e',
      'release-classify': 'demo/ci',
      'release-flag': 'src/lib',
      'release-instrument': 'src/app/api',
      'release-guard': 'demo/observe-release.mjs',
      'release-cleanup': 'README.md',
      production: 'demo/lib/release-state.mjs',
    };
    return `https://github.com/gyeutter-launchdarkly/factory-ecom-example/tree/main/${paths[key]}`;
  };
  const facts = step?.sources.flatMap((key) => details(key)) ?? [];
  const checks =
    step?.sources.flatMap((key) =>
      key === 'af-evidence-gates'
        ? Object.values(run.checks).flat()
        : (run.checks[key] ?? []),
    ) ?? [];
  const models =
    step?.sources.flatMap((key) =>
      run.agents[key] ? [run.agents[key]] : [],
    ) ?? [];
  const moveFocus = (event: React.KeyboardEvent, key: string) => {
    const index = JOURNEY_STEPS.findIndex((item) => item.key === key);
    const next =
      event.key === 'ArrowRight'
        ? Math.min(index + 1, JOURNEY_STEPS.length - 1)
        : event.key === 'ArrowLeft'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? JOURNEY_STEPS.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    buttons.current.get(JOURNEY_STEPS[next].key)?.focus();
  };
  return (
    <section className={`journey journey-${size}`} aria-label="Delivery steps">
      <div className="journey-phases">
        {JOURNEY.map((phase) => (
          <section
            className={`journey-phase journey-${phase.key}`}
            key={phase.key}
            aria-label={phase.title}
          >
            <ol className="journey-steps">
              {phase.steps.map((item) => {
                const status = ordered[JOURNEY_STEPS.indexOf(item)];
                const links = linksFor(item);
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={`journey-step journey-${status}`}
                      ref={(element) => {
                        if (element) buttons.current.set(item.key, element);
                        else buttons.current.delete(item.key);
                      }}
                      onClick={() =>
                        setSelected(selected === item.key ? null : item.key)
                      }
                      onKeyDown={(event) => moveFocus(event, item.key)}
                      aria-expanded={selected === item.key}
                      aria-controls="journey-evidence"
                      aria-label={`${item.title}: ${JOURNEY_STATUS_LABEL[status]}`}
                    >
                      <span
                        className={`journey-dot ${live && status === 'running' ? 'journey-live' : ''}`}
                        aria-hidden="true"
                      >
                        {status === 'done'
                          ? '✓'
                          : status === 'failed'
                            ? '×'
                            : status === 'prepared'
                              ? '−'
                              : ''}
                      </span>
                      <strong>{item.title}</strong>
                      <small>
                        {run.id === 'preview'
                          ? '\u00a0'
                          : JOURNEY_STATUS_LABEL[status]}
                      </small>
                    </button>
                    {!links.length && (
                      <Link
                        className="journey-artifact"
                        href={referenceFor(item.key)}
                        title={`${item.title} source reference`}
                      >
                        Source ↗
                      </Link>
                    )}
                    {links.slice(0, 2).map((resource) => (
                      <Link
                        key={resource.url}
                        className="journey-artifact"
                        href={resource.url}
                        title={resourceLabel(resource)}
                      >
                        {resourceLabel(resource)} ↗
                      </Link>
                    ))}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <div id="journey-evidence">
        {step && (
          <section
            className="journey-evidence"
            aria-label={`${step.title} evidence`}
          >
            <div className="journey-evidence-heading">
              <div>
                <h3>
                  {step.title}
                  <span>{JOURNEY_STATUS_LABEL[journeyStatus(step, run)]}</span>
                </h3>
                <p>{step.description}</p>
              </div>
              <button
                onClick={() => {
                  buttons.current.get(step.key)?.focus();
                  setSelected(null);
                }}
                aria-label="Close step details"
              >
                ×
              </button>
            </div>
            <div className="journey-evidence-grid">
              <div>
                <h4>Step activity</h4>
                {facts.length ? (
                  facts.map((fact, index) => (
                    <p key={index}>
                      {fact.url ? (
                        <Link href={fact.url}>{fact.text}</Link>
                      ) : (
                        fact.text
                      )}
                    </p>
                  ))
                ) : (
                  <p>
                    {journeyStatus(step, run) === 'done'
                      ? 'Step completed. Open the linked artifacts for details.'
                      : journeyStatus(step, run) === 'prepared'
                        ? 'Prepared before this run.'
                        : journeyStatus(step, run) === 'running'
                          ? 'Work is in progress.'
                          : 'This step is waiting for its work to begin.'}
                  </p>
                )}
                {models.map((agent, i) => (
                  <p key={i}>
                    {agent.provider} · {agent.model}
                  </p>
                ))}
                {step.sources.map((key) =>
                  elapsed(key) ? <p key={key}>{elapsed(key)} elapsed</p> : null,
                )}
              </div>
              <div>
                <h4>Evidence</h4>
                {resources.length ? (
                  resources.map((resource) => (
                    <Link key={resource.url} href={resource.url}>
                      {resourceLabel(resource)} ↗
                    </Link>
                  ))
                ) : (
                  <Link href={referenceFor(step.key)}>
                    Browse source reference ↗
                  </Link>
                )}
                {checks.map((check, index) => (
                  <p
                    key={index}
                    className={
                      check.ok ? 'journey-check-pass' : 'journey-check-fail'
                    }
                  >
                    {check.ok ? 'Passed' : 'Failed'}: {check.name}
                    {check.detail ? ` — ${check.detail}` : ''}
                  </p>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
