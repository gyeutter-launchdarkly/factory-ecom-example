import {
  AGENTS,
  CODING_AGENT,
  type PipelineResource,
} from './pipeline';

/**
 * Deep links used by the demo producers.
 *
 * Keep URL construction out of the visual component: the map should only render
 * links a producer explicitly supplied. That makes local mode and rehearsals
 * honest, and gives one place to update if a product route changes.
 */
export function githubResources(repo: string, pr: number): PipelineResource[] {
  const base = `https://github.com/${repo}/pull/${pr}`;
  return [
    { kind: 'pr', key: `#${pr}`, url: base, station: 'ext-pull-request' },
    {
      kind: 'commits',
      key: `#${pr}`,
      url: `${base}/commits`,
      station: CODING_AGENT,
      label: 'code changes',
    },
  ];
}

export function actionsResource(repo: string, run: string): PipelineResource {
  return {
    kind: 'run',
    key: run,
    url: `https://github.com/${repo}/actions/runs/${run}`,
    station: 'ext-ci',
    label: 'GitHub Actions run',
  };
}

/**
 * One monitoring destination per agent. A station links to the AI Config that
 * supplied its instructions/model, while the CI station links to execution.
 */
export function aiConfigResources(
  project: string,
  environment: string,
): PipelineResource[] {
  return AGENTS.map((agent) => ({
    kind: 'agent-config',
    key: agent.key,
    station: agent.key,
    label: 'AI Config monitoring',
    url:
      `https://app.launchdarkly.com/projects/${encodeURIComponent(project)}` +
      `/ai-configs/${encodeURIComponent(agent.key)}/monitoring` +
      `?env=${encodeURIComponent(environment)}`,
  }));
}

export function localRunResource(run: string): PipelineResource {
  return {
    kind: 'local-run',
    key: run,
    station: 'ext-ci',
    label: 'full local run log',
    url: `/api/factory-runs/${encodeURIComponent(run)}/log`,
  };
}

