import { describe, expect, it } from 'vitest';
import { factoryChecks } from '../../demo/lib/factory-checks.mjs';
import {
  releaseState,
  verifyDeployment,
} from '../../demo/lib/release-state.mjs';
const check = (
  status = 'completed',
  conclusion: string | null = 'success',
  slug = 'launchdarkly-factory',
) => ({ status, conclusion, app: { slug }, name: 'Factory' });
describe('Factory App completion', () => {
  it('ignores unrelated checks and missing checks', () => {
    expect(factoryChecks([], undefined).status).toBe('pending');
    expect(
      factoryChecks(
        [check('completed', 'success', 'github-actions')],
        undefined,
      ).status,
    ).toBe('pending');
  });
  it('does not mistake pending, skipped or neutral checks for success', () => {
    expect(factoryChecks([check('in_progress', null)], undefined).status).toBe(
      'running',
    );
    for (const outcome of ['neutral', 'skipped'])
      expect(
        factoryChecks([check('completed', outcome)], undefined).status,
      ).toBe('pending');
  });
  it('fails for an unsuccessful terminal check and waits for all checks', () => {
    expect(
      factoryChecks([check(), check('in_progress', null)], undefined).status,
    ).toBe('running');
    for (const outcome of [
      'failure',
      'cancelled',
      'timed_out',
      'action_required',
      'stale',
    ])
      expect(
        factoryChecks([check(), check('completed', outcome)], undefined).status,
      ).toBe('failed');
    expect(factoryChecks([check()], undefined).status).toBe('done');
  });
  it('supports an exact configured App identity', () => {
    expect(
      factoryChecks([check('completed', 'success', 'custom-app')], 'custom-app')
        .status,
    ).toBe('done');
    expect(factoryChecks([check()], 'custom-app').status).toBe('pending');
  });
});
describe('release evidence', () => {
  it('distinguishes completion, rollback and an interrupted monitor', () => {
    expect(releaseState({ kind: 'guarded', status: 'completed' })).toBe('done');
    expect(releaseState({ kind: 'guarded', status: 'in_progress' })).toBe(
      'running',
    );
    for (const status of ['reverted', 'monitoring_stopped'])
      expect(releaseState({ kind: 'guarded', status })).toBe('failed');
    expect(() =>
      releaseState({ kind: 'guarded', status: 'unknown' }),
    ).toThrow();
    expect(() =>
      releaseState({ kind: 'progressive', status: 'completed' }),
    ).toThrow();
  });
  it('requires the right service and exact deployed SHA', () => {
    expect(
      verifyDeployment(
        { ok: true, version: 'abc', service: 'checkout-demo' },
        'abc',
        'checkout-demo',
      ),
    ).toBe(true);
    expect(
      verifyDeployment(
        { ok: true, version: 'dev', service: 'checkout-demo' },
        'abc',
        'checkout-demo',
      ),
    ).toBe(false);
    expect(
      verifyDeployment(
        { ok: true, version: 'abc', service: 'other' },
        'abc',
        'checkout-demo',
      ),
    ).toBe(false);
  });
});
