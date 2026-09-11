import { describe, expect, it } from 'vitest';
// The controller shares its pure readiness rules from ESM.
import { readiness } from '../../demo/lib/readiness.mjs';
const tools = {
  node: true,
  bash: true,
  jq: true,
  git: true,
  gh: true,
  github: true,
  cli: true,
};
describe('readiness', () => {
  it('keeps rehearsal available without release credentials', () => {
    const report = readiness({}, tools);
    expect(report.modes.rehearsal.ready).toBe(true);
    expect(report.release.ready).toBe(false);
    expect(report.release.missing).toContain('FACTORY_RELEASE_ID');
  });
  it('does not mistake template credentials for configuration', () => {
    expect(
      readiness({ LD_API_KEY: 'api-', LD_APP_PROJECT_KEY: 'test' }, tools).modes
        .hosted.missing,
    ).toContain('LD_API_KEY');
  });
  it('rejects invalid release URLs and missing tools', () => {
    expect(
      readiness({ FACTORY_STORE_URL: 'javascript:bad' }, tools).release.missing,
    ).toContain('Valid FACTORY_STORE_URL');
    expect(readiness({}, { ...tools, jq: false }).modes.rehearsal.ready).toBe(
      false,
    );
  });
});

it('requires ordered adapters for adapter-driven live modes', () => {
  for (const mode of ['factory', 'local'])
    expect(readiness({}, tools).modes[mode].missing).toContain(
      'Ordered live adapters (FACTORY_LIVE_CONFIG)',
    );
});

it('enables the concrete local deployment without cloud credentials', () => {
  const report = readiness(
    {},
    { ...tools, liveSequence: true, localDeployment: true },
  );
  expect(report.modes.local.ready).toBe(true);
  expect(report.modes.hosted.ready).toBe(false);
  expect(report.modes.factory.ready).toBe(false);
});

it('enables hosted GitHub Actions runs with GitHub and LaunchDarkly access', () => {
  const env = { LD_API_KEY: 'api-x', LD_APP_PROJECT_KEY: 'demo' };
  // The whole-graph Actions runner does not need ordered live adapters.
  const report = readiness(env, { ...tools, localDeployment: true });
  expect(report.modes.hosted.ready).toBe(true);
  expect(readiness(env, { ...tools, github: false }).modes.hosted.ready).toBe(
    false,
  );
});
