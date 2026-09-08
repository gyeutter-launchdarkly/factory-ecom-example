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
    <section
      className={`journey journey-${size}`}
      aria-label="Write it. Release it. Run it."
    >
      <div className="journey-phases">
        {JOURNEY.map((phase, index) => (
          <section
            className={`journey-phase journey-${phase.key}`}
            key={phase.key}
            aria-label={phase.title}
          >
            <h2>
              <span aria-hidden="true">0{index + 1}</span>
              {phase.title}
            </h2>
            <ol className="journey-steps">
              {phase.steps.map((item) => {
                const status = journeyStatus(item, run);
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
                <h4>Observed work</h4>
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
                  <p>No execution evidence reported for this step yet.</p>
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
                  <p>No linked artifacts yet.</p>
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
