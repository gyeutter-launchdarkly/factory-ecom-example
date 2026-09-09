import { describe, expect, it } from 'vitest';
import { deliverySummary, type DeliveryRun } from './delivery-summary';
const base: DeliveryRun = {
  pr: 4,
  statuses: {},
  agents: {},
  resources: [],
  checks: {},
  judges: {},
  finished: true,
  mode: 'hosted',
  verdict: { approved: true, risk: 'low' },
};
describe('delivery summary', () => {
  it('does not call finished agents a customer release', () => {
    expect(deliverySummary(base)).toMatchObject({
      label: 'Review approved · awaiting merge',
      action: 'review',
    });
    expect(deliverySummary({ ...base, verdict: null })).toMatchObject({
      label: 'Run finished · release unverified',
    });
  });
  it('explains each post-review handoff', () => {
    expect(
      deliverySummary({ ...base, statuses: { 'ext-merge': 'done' } }).label,
    ).toBe('Merged · awaiting deployment');
    expect(
      deliverySummary({ ...base, statuses: { 'ext-deploy': 'done' } }).label,
    ).toBe('Deployed · awaiting rollout');
    expect(
      deliverySummary({
        ...base,
        statuses: { 'ld-guarded-release': 'running' },
      }).label,
    ).toBe('Guarded rollout in progress');
  });
  it('requires both deployment and outcome, even with an approved review', () => {
    expect(
      deliverySummary({ ...base, statuses: { 'ld-outcome': 'done' } }).action,
    ).not.toBe('store');
    expect(
      deliverySummary({
        ...base,
        statuses: { 'ext-deploy': 'done', 'ld-outcome': 'done' },
      }),
    ).toMatchObject({ label: 'Released to customers', action: 'store' });
  });
  it('lets a stopped release or failed check override apparent success', () => {
    expect(
      deliverySummary({
        ...base,
        statuses: { 'ext-deploy': 'done', 'ld-outcome': 'failed' },
      }),
    ).toMatchObject({ label: 'Release stopped', tone: 'stopped' });
    expect(
      deliverySummary({
        ...base,
        checks: { flag: [{ name: 'exists', ok: false }] },
        statuses: { 'ext-deploy': 'done', 'ld-outcome': 'done' },
      }).tone,
    ).toBe('stopped');
    expect(
      deliverySummary({ ...base, verdict: { approved: false, risk: 'high' } })
        .label,
    ).toBe('Review rejected');
  });
  it.each(['recorded', 'rehearsal', 'simulation'])(
    'never offers live release actions for %s',
    (mode) => {
      const summary = deliverySummary({
        ...base,
        mode,
        statuses: { 'ext-deploy': 'done', 'ld-outcome': 'done' },
      });
      expect(summary.action).toBeNull();
      expect(summary.label).toMatch(/^(Recording|Rehearsal):/);
    },
  );
});

it('treats cleanup as a follow-up to an already verified release', () => {
  const summary = deliverySummary({
    ...base,
    statuses: {
      'ext-deploy': 'done',
      'ld-outcome': 'done',
      'release-cleanup': 'failed',
    },
  });
  expect(summary.label).toBe('Released to customers');
  expect(summary.detail).toContain('Cleanup needs attention');
});
it('does not ask a completed rehearsal to merge a simulated PR', () => {
  expect(deliverySummary({ ...base, mode: 'rehearsal' }).label).toBe(
    'Rehearsal: complete',
  );
});

it('does not call a partial ordered live sequence released', () => {
  const run = {
    pr: null,
    statuses: {
      'live-sequence-v1': 'done',
      'release-cleanup': 'failed',
      'ext-deploy': 'done',
      'ld-outcome': 'done',
    },
    agents: {},
    resources: [],
    checks: {},
    judges: {},
    finished: true,
    mode: 'hosted',
  };
  expect(deliverySummary(run).label).toBe('Cleanup stopped');
});
