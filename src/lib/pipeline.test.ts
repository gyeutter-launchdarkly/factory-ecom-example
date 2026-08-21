import { describe, expect, it } from 'vitest';
import {
  CI_RUN,
  FLAG_AGENT,
  resourcesForStation,
  stageStatus,
  type PipelineResource,
} from './pipeline';

const baseRun = {
  pr: 12,
  statuses: {},
  agents: {},
  resources: [] as PipelineResource[],
  checks: {},
  judges: {},
  finished: false,
};

describe('pipeline resources', () => {
  it('places artifacts at the station that produced or governed them', () => {
    const resources: PipelineResource[] = [
      { kind: 'flag', key: 'quick-order', url: 'https://ld/flag' },
      {
        kind: 'agent-config',
        key: FLAG_AGENT,
        station: FLAG_AGENT,
        url: 'https://ld/config',
      },
      { kind: 'run', key: '42', url: 'https://github/actions/42' },
    ];

    expect(resourcesForStation(resources, FLAG_AGENT).map((item) => item.kind)).toEqual([
      'flag',
      'agent-config',
    ]);
    expect(resourcesForStation(resources, CI_RUN).map((item) => item.kind)).toEqual([
      'run',
    ]);
  });

  it('deduplicates repeated watcher resources', () => {
    const resource: PipelineResource = {
      kind: 'metric',
      key: 'conversion',
      url: 'https://ld/metric',
    };
    expect(resourcesForStation([resource, resource], 'autofactory-metrics-author')).toHaveLength(1);
  });
});

describe('factory-run station', () => {
  const station = {
    key: CI_RUN,
    title: 'Factory run',
    blurb: '',
    owner: 'external' as const,
    kind: 'stage' as const,
  };

  it('runs from GitHub Actions or a local log resource', () => {
    expect(
      stageStatus(station, {
        ...baseRun,
        resources: [{ kind: 'local-run', key: 'local-1', url: '/log' }],
      }),
    ).toBe('running');
    expect(
      stageStatus(station, {
        ...baseRun,
        finished: true,
        resources: [{ kind: 'run', key: '42', url: 'https://github/actions/42' }],
      }),
    ).toBe('done');
  });
});

