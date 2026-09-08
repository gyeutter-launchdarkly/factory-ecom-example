import { describe, expect, it } from 'vitest';
import { JOURNEY_STEPS, journeyStatus } from './journey';
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
  journeyStatus(
    JOURNEY_STEPS.find((step) => step.key === key)!,
    { ...base, ...run },
  );
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
