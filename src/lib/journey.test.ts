import { describe, expect, it } from 'vitest';
import {
  JOURNEY_STEPS,
  journeyStatus,
  orderedJourneyStatuses,
} from './journey';
import { FLAG_AGENT, GUARDED_RELEASE, type RunView } from './pipeline';
const base: RunView = {
  pr: null,
  statuses: {},
  agents: {},
  resources: [],
  checks: {},
  judges: {},
  finished: false,
};
const status = (key: string, run: Partial<RunView> = {}) =>
  journeyStatus(JOURNEY_STEPS.find((step) => step.key === key)!, {
    ...base,
    ...run,
  });
describe('journey evidence', () => {
  it('does not invent planning/design execution or production from a finished agent run', () => {
    for (const key of [
      'write-plan',
      'write-design',
      'production',
      'release-cleanup',
      'release-guard',
    ])
      expect(status(key, { finished: true })).toBe('pending');
  });
  it('identifies pre-existing code as prepared', () => {
    expect(status('write-code', { pr: 2 })).toBe('prepared');
  });
  it('shows design as prepared once a prepared change is on record', () => {
    expect(status('write-design', { pr: 2 })).toBe('prepared');
  });
  it('completes planning from the recorded request, not only a planning agent', () => {
    expect(status('write-plan', { statuses: { 'ext-request': 'done' } })).toBe(
      'done',
    );
    expect(status('write-plan', { pr: 2 })).toBe('pending');
  });
  it('does not treat a release manifest as a completed guarded release', () => {
    expect(
      status('release-guard', {
        statuses: { 'autofactory-manifest-steward': 'done' },
      }),
    ).toBe('pending');
  });
  it('requires both deployed SHA evidence and rollout completion', () => {
    expect(status('production', { statuses: { 'ld-outcome': 'done' } })).toBe(
      'pending',
    );
    expect(
      status('production', {
        statuses: { 'ld-outcome': 'done', 'ext-deploy': 'done' },
      }),
    ).toBe('done');
  });
  it('surfaces regressions even after a successful deployment', () => {
    expect(
      status('production', {
        statuses: { 'ext-deploy': 'done', 'ld-outcome': 'failed' },
      }),
    ).toBe('failed');
    expect(
      status('release-guard', { statuses: { [GUARDED_RELEASE]: 'failed' } }),
    ).toBe('failed');
  });
  it('prioritizes failed evidence over claimed test success', () => {
    expect(
      status('write-validate', {
        statuses: { 'autofactory-flag-testing': 'done' },
        checks: { [FLAG_AGENT]: [{ name: 'exists', ok: false }] },
      }),
    ).toBe('failed');
  });
});

it('fills only a contiguous sequence while preserving later failures', () => {
  const run = {
    ...base,
    statuses: {
      'write-plan': 'done',
      'write-code': 'done',
      'autofactory-code-reviewer': 'failed',
    },
  };
  expect(orderedJourneyStatuses(run).slice(0, 4)).toEqual([
    'done',
    'pending',
    'ready',
    'failed',
  ]);
});

it('fills every circle for the actual rehearsal event stream in order', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(`${tmpdir()}/journey-`);
  try {
    const file = `${dir}/events.ndjson`;
    execFileSync(
      process.execPath,
      ['demo/lib/rehearse-journey.mjs', 'express-checkout', '0'],
      { env: { ...process.env, FACTORY_PROGRESS_FILE: file } },
    );
    const run = { ...base, statuses: {} as Record<string, string> };
    let completed = 0;
    for (const event of readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))) {
      if (event.t !== 'node') continue;
      run.statuses[event.key] = event.status;
      const states = orderedJourneyStatuses(run);
      const next = states.filter((s) => s === 'done').length;
      expect(next).toBeGreaterThanOrEqual(completed);
      expect(next - completed).toBeLessThanOrEqual(1);
      expect(states.slice(0, next).every((s) => s === 'done')).toBe(true);
      completed = next;
    }
    expect(completed).toBe(11);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('ordered live circles require explicit verified completion, never legacy agent activity', () => {
  expect(
    status('write-code', {
      pr: 123,
      statuses: { 'live-sequence-v1': 'done', 'ext-coding-agent': 'done' },
    }),
  ).toBe('pending');
  expect(
    status('production', {
      statuses: {
        'live-sequence-v1': 'done',
        'ext-deploy': 'done',
        'ld-outcome': 'done',
      },
    }),
  ).toBe('pending');
  expect(
    status('production', {
      statuses: { 'live-sequence-v1': 'done', production: 'done' },
    }),
  ).toBe('done');
});
