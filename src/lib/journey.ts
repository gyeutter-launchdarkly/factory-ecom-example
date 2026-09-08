import {
  FLAG_AGENT,
  METRICS_AGENT,
  REVIEWER,
  TEST_AGENT,
  RELEASE_AGENT,
  EVIDENCE_GATES,
  GUARDED_RELEASE,
  CODING_AGENT,
  type RunView,
} from './pipeline';

export type JourneyStatus =
  'pending' | 'prepared' | 'running' | 'done' | 'failed' | 'skipped';
export type JourneyStep = {
  key: string;
  title: string;
  description: string;
  sources: string[];
};
export const JOURNEY: { key: string; title: string; steps: JourneyStep[] }[] = [
  {
    key: 'write',
    title: 'Write it.',
    steps: [
      {
        key: 'write-plan',
        title: 'Plan',
        description:
          'Define the change and its acceptance criteria. Prepared scenarios supply the request; planning execution is only shown when reported.',
        sources: ['write-plan', 'ext-request'],
      },
      {
        key: 'write-design',
        title: 'Design',
        description:
          'Decide the experience and implementation approach. This demo starts from a prepared feature branch; no design agent is implied.',
        sources: ['write-design'],
      },
      {
        key: 'write-code',
        title: 'Code',
        description:
          'Inspect the feature change. Prepared means the branch already existed before this run.',
        sources: ['write-code', CODING_AGENT, 'ext-pull-request'],
      },
      {
        key: 'write-review',
        title: 'Review',
        description:
          'Review the actual change and its verdict. A rejected review stops the release.',
        sources: [REVIEWER],
      },
      {
        key: 'write-validate',
        title: 'Validate',
        description:
          'Run the feature tests and inspect the independent handoff checks.',
        sources: [TEST_AGENT, 'factory-validation', EVIDENCE_GATES, 'ext-ci'],
      },
    ],
  },
  {
    key: 'release',
    title: 'Release it.',
    steps: [
      {
        key: 'release-classify',
        title: 'Classify',
        description: 'Assess the change and decide whether it needs a flag.',
        sources: ['autofactory-research-planner'],
      },
      {
        key: 'release-flag',
        title: 'Flag',
        description:
          'Create the release flag and wire its control and treatment paths.',
        sources: [FLAG_AGENT],
      },
      {
        key: 'release-instrument',
        title: 'Instrument',
        description:
          'Connect events and metrics to the behavior being released.',
        sources: [METRICS_AGENT],
      },
      {
        key: 'release-guard',
        title: 'Guard release',
        description:
          'Inspect the release manifest, merge, deployment, and observed guarded rollout. A manifest alone does not mean the feature was released.',
        sources: [
          GUARDED_RELEASE,
          RELEASE_AGENT,
          'ext-merge',
          'ext-deploy',
          'af-beacon',
        ],
      },
      {
        key: 'release-cleanup',
        title: 'Cleanup',
        description:
          'After a stable release, remove the temporary flag and obsolete code through a reviewed change. Resetting a demo is not release cleanup.',
        sources: ['release-cleanup'],
      },
    ],
  },
  {
    key: 'run',
    title: 'Run it.',
    steps: [
      {
        key: 'production',
        title: 'Production',
        description:
          'The deployed SHA and release outcome must be verified before this step can complete. Rollback is shown as a stopped release.',
        sources: ['ld-outcome', 'ext-deploy'],
      },
    ],
  },
];
export const JOURNEY_STEPS = JOURNEY.flatMap((phase) => phase.steps);
export function journeyStatus(step: JourneyStep, run: RunView): JourneyStatus {
  const state = (key: string): JourneyStatus => {
    const value = run.statuses[key];
    return ['running', 'done', 'failed', 'skipped'].includes(value)
      ? (value as JourneyStatus)
      : 'pending';
  };
  if (step.key === 'write-code') {
    if (state('write-code') !== 'pending') return state('write-code');
    return run.pr !== null || run.resources.some((r) => r.kind === 'commits')
      ? 'prepared'
      : 'pending';
  }
  if (step.key === 'write-validate') {
    if (
      Object.values(run.checks)
        .flat()
        .some((check) => !check.ok)
    )
      return 'failed';
    return state('factory-validation') !== 'pending'
      ? state('factory-validation')
      : state(TEST_AGENT);
  }
  if (step.key === 'release-guard') return state(GUARDED_RELEASE);
  if (step.key === 'production') {
    if (state('ld-outcome') === 'failed' || state('ext-deploy') === 'failed')
      return 'failed';
    if (state('ld-outcome') === 'done' && state('ext-deploy') === 'done')
      return 'done';
    if (state('ld-outcome') === 'running' || state('ext-deploy') === 'running')
      return 'running';
    return 'pending';
  }
  return state(step.sources[0]);
}
export const JOURNEY_STATUS_LABEL: Record<JourneyStatus, string> = {
  pending: 'Not observed',
  prepared: 'Prepared',
  running: 'Running',
  done: 'Complete',
  failed: 'Stopped',
  skipped: 'Not used',
};
