import { GUARDED_RELEASE, REVIEWER, type RunView } from './pipeline';
import { JOURNEY_STEPS } from './journey';

export type DeliveryRun = RunView & {
  mode?: string | null;
  verdict?: { approved: boolean; risk: string | null } | null;
};
export type DeliverySummary = {
  label: string;
  detail: string;
  tone: 'neutral' | 'active' | 'success' | 'stopped';
  action: 'review' | 'observe' | 'store' | null;
};

/** Agent completion is not delivery. Replays never claim a current release. */
export function deliverySummary(run: DeliveryRun | null): DeliverySummary {
  if (!run)
    return {
      label: 'Ready for a change',
      detail: 'Choose a scenario to begin.',
      tone: 'neutral',
      action: null,
    };
  const s = run.statuses;
  const simulated = ['rehearsal', 'simulation'].includes(run.mode ?? '');
  const recorded = run.mode === 'recorded';
  const prefix = simulated ? 'Rehearsal: ' : recorded ? 'Recording: ' : '';
  const result = (
    label: string,
    detail: string,
    tone: DeliverySummary['tone'],
    action: DeliverySummary['action'],
  ): DeliverySummary => ({
    label:
      simulated && run.finished && tone !== 'stopped'
        ? 'Rehearsal: complete'
        : prefix + label,
    detail: simulated
      ? 'Simulated events. No customer release occurred.'
      : recorded
        ? 'Captured evidence from a past run. This playback does not deploy changes.'
        : detail,
    tone,
    action: simulated || recorded ? null : action,
  });
  if (s[GUARDED_RELEASE] === 'failed' || s['ld-outcome'] === 'failed')
    return result(
      'Release stopped',
      'Inspect the rollout outcome before proceeding.',
      'stopped',
      'observe',
    );
  if (run.verdict?.approved === false || s[REVIEWER] === 'failed')
    return result(
      'Review rejected',
      'Open the verdict, address the findings, then run the review again.',
      'stopped',
      'review',
    );
  if (
    Object.values(run.checks)
      .flat()
      .some((check) => !check.ok) ||
    Object.entries(s).some(
      ([key, status]) => key !== 'release-cleanup' && status === 'failed',
    )
  )
    return result(
      'Change blocked',
      'A check failed. Open the stopped step for evidence.',
      'stopped',
      'review',
    );
  if (s['ext-deploy'] === 'done' && s['ld-outcome'] === 'done')
    return result(
      'Released to customers',
      s['release-cleanup'] === 'failed'
        ? 'Deployment and rollout are verified. Cleanup needs attention.'
        : s['release-cleanup'] === 'done'
          ? 'Deployment, rollout, and cleanup are verified.'
          : 'Deployment and rollout are verified. Cleanup is a separate follow-up.',
      'success',
      'store',
    );
  if (s[GUARDED_RELEASE] === 'running' || s['ld-outcome'] === 'running')
    return result(
      'Guarded rollout in progress',
      'Observe the release until a verified outcome is reported.',
      'active',
      'observe',
    );
  if (s['ext-deploy'] === 'done')
    return result(
      'Deployed · awaiting rollout',
      'The deployed commit is verified. Observe the guarded release next.',
      'active',
      'observe',
    );
  if (s['ext-merge'] === 'done')
    return result(
      'Merged · awaiting deployment',
      'Deploy the merged commit, then verify its release.',
      'neutral',
      'observe',
    );
  if (run.verdict?.approved === true)
    return result(
      'Review approved · awaiting merge',
      'Review and merge the PR, deploy it, then observe the release.',
      'neutral',
      'review',
    );
  if (run.finished)
    return result(
      'Run finished · release unverified',
      'Inspect the checks and review verdict before merging.',
      'neutral',
      'review',
    );
  const active = JOURNEY_STEPS.find((step) =>
    step.sources.some((key) => s[key] === 'running'),
  );
  return result(
    active ? `${active.title} in progress` : 'Waiting for evidence',
    'The current step will update as evidence arrives.',
    active ? 'active' : 'neutral',
    null,
  );
}
