/** Interpret only the configured Factory App's checks on the current head SHA. */
export function factoryChecks(checks, appSlug) {
  const relevant = checks.filter((check) =>
    appSlug
      ? check.app?.slug === appSlug
      : /factory/i.test(check.app?.slug ?? ''),
  );
  if (!relevant.length) return { status: 'pending', checks: [] };
  const failed = relevant.some(
    (check) =>
      check.status === 'completed' &&
      [
        'failure',
        'cancelled',
        'timed_out',
        'action_required',
        'startup_failure',
        'stale',
      ].includes(check.conclusion),
  );
  if (failed) return { status: 'failed', checks: relevant };
  if (
    relevant.some((check) => check.status !== 'completed' || !check.conclusion)
  )
    return { status: 'running', checks: relevant };
  // Skipped/neutral checks are not evidence that the factory executed successfully.
  if (relevant.every((check) => check.conclusion === 'success'))
    return { status: 'done', checks: relevant };
  return { status: 'pending', checks: relevant };
}
