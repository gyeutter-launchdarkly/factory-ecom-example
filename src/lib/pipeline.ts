/**
 * The pipeline the factory pane draws: one lane, request to released.
 *
 * The point of the shape is attribution. A six-agent flowchart invites "any
 * coding agent could do that", because the parts that make the output safe to
 * ship are invisible: the AI Configs that define each agent, the sampled
 * judges, the flags and metrics as real platform resources, the guarded release
 * that compares treatment against control and rolls itself back. So every
 * stage carries an owner, and the pane colours by owner while status stays the
 * fill — see the legend in PipelineRail and the tokens in globals.css.
 *
 * LaunchDarkly and AutoFactory are both LaunchDarkly's; they are separated
 * because one is the platform a customer already buys and the other is the
 * pipeline that runs on it. "Your stack" is what the customer already has, and
 * is the honest answer to "what do we not have to change".
 */

export type Owner = 'launchdarkly' | 'autofactory' | 'external';

/**
 * `beyond` is a stage that happens after this run ends — merge onward. It is
 * drawn so the end-to-end model is explainable, and drawn differently so
 * nothing on screen claims to have happened when it did not.
 */
export type Status = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'beyond';

export type Stage = {
  /** Agents use their AI Config key, so run events address them directly. */
  key: string;
  title: string;
  /** What it does, in words a customer uses. */
  blurb: string;
  owner: Owner;
  /** Agents get live per-step data (model, tags, judge); stages get `detail`. */
  kind: 'agent' | 'stage';
  /** Static subtext for non-agent stages. */
  detail?: string;
};

export const OWNER_LABEL: Record<Owner, string> = {
  launchdarkly: 'LaunchDarkly platform',
  autofactory: 'AutoFactory',
  external: 'Your existing stack',
};

export const OWNER_TITLE: Record<Owner, string> = {
  launchdarkly: 'Provided by the LaunchDarkly platform: AI Configs, judges, monitoring, flags, metrics, guarded releases',
  autofactory: "AutoFactory's own code: orchestration, evidence gates, the release manifest, Beacon",
  external: 'Tools you already run: your issue tracker, coding agent, GitHub, CI, test runner, and CD',
};

export const OWNER_CLASS: Record<Owner, string> = {
  launchdarkly: 'own-ld',
  autofactory: 'own-af',
  external: 'own-ext',
};

export const CONTROL_PLANE = 'ld-control-plane';
export const EVIDENCE_GATES = 'af-evidence-gates';
export const CODING_AGENT = 'ext-coding-agent';
export const GUARDED_RELEASE = 'ld-guarded-release';
export const REVIEWER = 'autofactory-code-reviewer';
export const FLAG_AGENT = 'autofactory-flag-implementer';
export const METRICS_AGENT = 'autofactory-metrics-author';
export const RELEASE_AGENT = 'autofactory-manifest-steward';
export const TEST_AGENT = 'autofactory-flag-testing';
export const PULL_REQUEST = 'ext-pull-request';
export const CI_RUN = 'ext-ci';

/**
 * Stage order is the story order. The agent sub-sequence keeps the order the
 * pane has always shown (flag, then metrics, then the release handoff), which
 * reads as cause and effect even though the graph runs the steward earlier.
 */
export const PIPELINE: readonly Stage[] = [
  {
    key: 'ext-request',
    title: 'Request',
    blurb: 'a ticket or issue asks for a change',
    owner: 'external',
    kind: 'stage',
    detail: 'your tracker',
  },
  {
    key: CODING_AGENT,
    title: 'Coding agent',
    blurb: 'writes the change itself',
    owner: 'external',
    kind: 'stage',
    detail: 'Claude, Cursor, Copilot',
  },
  {
    key: 'ext-pull-request',
    title: 'Pull request',
    blurb: 'the change arrives for review',
    owner: 'external',
    kind: 'stage',
    detail: 'GitHub',
  },
  {
    key: 'ext-ci',
    title: 'Factory run',
    blurb: 'runs the agent chain',
    owner: 'external',
    kind: 'stage',
    detail: 'GitHub Actions or local',
  },
  {
    key: CONTROL_PLANE,
    // "Agent control plane" is the full name, and it does not fit a card; the
    // legend and the blurb carry the rest.
    title: 'Control plane',
    blurb: 'defines every agent below: instructions, model, tools, routing',
    owner: 'launchdarkly',
    kind: 'stage',
    detail: 'AI Configs, editable without a deploy',
  },
  {
    key: 'autofactory-research-planner',
    title: 'Plan',
    blurb: 'decides if this needs a flag',
    owner: 'autofactory',
    kind: 'agent',
  },
  {
    key: FLAG_AGENT,
    title: 'Flag',
    blurb: 'creates the flag, wires the code',
    owner: 'autofactory',
    kind: 'agent',
  },
  {
    key: 'autofactory-metrics-author',
    title: 'Metrics',
    blurb: 'adds metrics, wires the events',
    owner: 'autofactory',
    kind: 'agent',
  },
  {
    key: 'autofactory-manifest-steward',
    title: 'Release',
    blurb: 'writes the Beacon rollout handoff',
    owner: 'autofactory',
    kind: 'agent',
  },
  {
    key: 'autofactory-flag-testing',
    title: 'Tests',
    blurb: 'writes flag tests, runs your suite',
    owner: 'autofactory',
    kind: 'agent',
  },
  {
    key: EVIDENCE_GATES,
    title: 'Evidence gates',
    blurb: 'checks each claim against the platform and the code',
    owner: 'autofactory',
    kind: 'stage',
    detail: 'deterministic, not a model',
  },
  {
    key: REVIEWER,
    title: 'Review',
    blurb: 'approves or rejects the diff',
    owner: 'autofactory',
    kind: 'agent',
  },
  {
    key: 'ext-merge',
    title: 'Merge',
    blurb: 'an approved change lands',
    owner: 'external',
    kind: 'stage',
    detail: 'GitHub',
  },
  {
    key: 'ext-deploy',
    title: 'Deploy',
    blurb: 'ships the code, flag still off',
    owner: 'external',
    kind: 'stage',
    detail: 'your CD system',
  },
  {
    key: 'af-beacon',
    title: 'Beacon',
    blurb: 'finds the new manifest and starts the release',
    owner: 'autofactory',
    kind: 'stage',
    detail: 'reads the rollout handoff',
  },
  {
    key: GUARDED_RELEASE,
    title: 'Guarded release',
    blurb: 'ramps traffic and compares against control',
    owner: 'launchdarkly',
    kind: 'stage',
    detail: 'staged rollout, server-side',
  },
  {
    key: 'ld-outcome',
    title: 'Released',
    blurb: 'or rolled back on a regression, without a deploy',
    owner: 'launchdarkly',
    kind: 'stage',
    detail: 'automatic rollback',
  },
];

/** Stages after the run's boundary: explainable, never claimed as executed. */
const BEYOND = new Set(['ext-merge', 'ext-deploy', 'af-beacon', GUARDED_RELEASE, 'ld-outcome']);

/** The agent sub-sequence, which is what a run reports progress against. */
export const AGENTS = PIPELINE.filter((stage) => stage.kind === 'agent');

/**
 * The feedback paths, all of which exist today.
 *
 * Deliberately absent: an automatic judge-to-coding-agent revision loop. Judges
 * are sampled and non-blocking (packages/shared/src/judges.ts records a score
 * and moves on; decideApproval never reads one), so the honest judge loop runs
 * through monitoring into the next run's instructions and model. Drawing it as
 * a code-fixing loop would be the one claim on this chart a customer's engineer
 * could disprove.
 */
export type Loop = {
  from: string;
  to: string;
  label: string;
  /** Stacking order, so arcs of different spans do not overlap. */
  depth: number;
};

export const LOOPS: readonly Loop[] = [
  {
    from: EVIDENCE_GATES,
    to: FLAG_AGENT,
    label: 'a failed check halts the chain',
    depth: 1,
  },
  {
    from: FLAG_AGENT,
    to: CONTROL_PLANE,
    label: 'judge scores tune the next run',
    depth: 2,
  },
  {
    from: REVIEWER,
    to: CODING_AGENT,
    label: 'rejected: the change goes back for revision',
    depth: 3,
  },
  {
    from: GUARDED_RELEASE,
    to: CODING_AGENT,
    label: 'regression: rolled back, then fixed here',
    depth: 4,
  },
];

/** One line of what a stage produced; a URL makes it a link into the platform. */
export type Detail = { text: string; url?: string };

export type ResourceKind =
  | 'pr'
  | 'commits'
  | 'run'
  | 'local-run'
  | 'agent-config'
  | 'flag'
  | 'metric'
  | 'event'
  | 'manifest'
  | 'verdict';

/** A linkable piece of evidence produced by or governing one station. */
export type PipelineResource = {
  kind: ResourceKind;
  key: string;
  url: string;
  station?: string;
  label?: string;
};

const RESOURCE_STATION: Record<ResourceKind, string> = {
  pr: PULL_REQUEST,
  commits: CODING_AGENT,
  run: CI_RUN,
  'local-run': CI_RUN,
  'agent-config': CONTROL_PLANE,
  flag: FLAG_AGENT,
  metric: METRICS_AGENT,
  event: METRICS_AGENT,
  manifest: RELEASE_AGENT,
  verdict: REVIEWER,
};

export function stationForResource(resource: PipelineResource): string {
  if (resource.station) return resource.station;
  if (resource.kind === 'agent-config' && PIPELINE.some((stage) => stage.key === resource.key)) {
    return resource.key;
  }
  return RESOURCE_STATION[resource.kind];
}

export function resourceLabel(resource: PipelineResource): string {
  if (resource.label) return resource.label;
  switch (resource.kind) {
    case 'pr':
      return `PR ${resource.key}`;
    case 'commits':
      return 'code changes';
    case 'run':
      return 'GitHub Actions run';
    case 'local-run':
      return 'full local run log';
    case 'agent-config':
      return 'AI Config monitoring';
    case 'flag':
      return `flag: ${resource.key}`;
    case 'metric':
      return `metric: ${resource.key}`;
    case 'event':
      return `event: ${resource.key}`;
    case 'manifest':
      return `manifest: ${resource.key.split('/').pop()}`;
    case 'verdict':
      return 'review verdict';
  }
}

export function resourcesForStation(
  resources: readonly PipelineResource[],
  station: string,
): PipelineResource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    if (stationForResource(resource) !== station) return false;
    const identity = `${resource.kind}:${resource.key}:${resource.url}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/** A check the deterministic verifier ran after a node. */
export type Check = { name: string; ok: boolean; detail?: string };

/**
 * A LaunchDarkly judge's score for a node, when it was sampled. The judge's own
 * key is absent in the closing summary form, which reports only the score.
 */
export type Judge = { judge: string | null; score: number | null; reasoning?: string };

/**
 * The parts of a run this module needs. Structural, so the pane's own Run type
 * satisfies it without either file importing the other's shape.
 */
export interface RunView {
  pr: number | null;
  statuses: Record<string, string>;
  agents: Record<string, unknown>;
  resources: readonly PipelineResource[];
  checks: Record<string, readonly Check[]>;
  judges: Record<string, readonly Judge[]>;
  finished: boolean;
}

function allChecks(run: RunView): Check[] {
  return Object.values(run.checks).flat();
}

/** Whether any deterministic check failed, which is what halts a chain. */
export function checksFailed(run: RunView): boolean {
  return allChecks(run).some((check) => !check.ok);
}

/**
 * A stage's status. Agents report their own; everything else is inferred from
 * what the run has produced, so the rail fills in from the same event stream
 * rather than needing new instrumentation for the parts around the agents.
 */
export function stageStatus(stage: Stage, run: RunView): Status {
  if (BEYOND.has(stage.key)) return 'beyond';
  if (stage.kind === 'agent') return (run.statuses[stage.key] as Status) ?? 'pending';

  switch (stage.key) {
    // The request and the change predate the run: a run only exists because
    // somebody asked for something and an agent wrote it.
    case 'ext-request':
    case CODING_AGENT:
      return 'done';
    // Local mode has no PR and no Actions run, and saying "skipped" is the
    // point: the same chain runs without GitHub in the loop.
    case 'ext-pull-request':
      return run.pr !== null ? 'done' : 'skipped';
    case 'ext-ci': {
      const execution = run.resources.some(
        (resource) => resource.kind === 'run' || resource.kind === 'local-run',
      );
      if (!execution) return 'skipped';
      return run.finished ? 'done' : 'running';
    }
    // Resolved when the first agent reports the model its AI Config selected.
    case CONTROL_PLANE:
      return Object.keys(run.agents).length > 0 ? 'done' : 'pending';
    case EVIDENCE_GATES: {
      const checks = allChecks(run);
      if (checks.some((check) => !check.ok)) return 'failed';
      if (checks.length > 0) return 'done';
      // A rehearsal emits none, and a finished run that reported none never
      // gated anything — neither is "still waiting".
      return run.finished ? 'skipped' : 'pending';
    }
    default:
      return 'pending';
  }
}
