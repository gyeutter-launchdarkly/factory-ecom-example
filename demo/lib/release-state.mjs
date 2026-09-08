/** A release API success response alone does not establish a release outcome. */
export function releaseState(release) {
  if (release?.kind !== 'guarded')
    throw new Error(
      'Expected a guarded release; progressive rollout is not guarded evidence',
    );
  if (release.status === 'in_progress') return 'running';
  if (release.status === 'completed') return 'done';
  if (['reverted', 'monitoring_stopped'].includes(release.status))
    return 'failed';
  throw new Error(
    `Unrecognized release status: ${release?.status ?? 'missing'}`,
  );
}
export function verifyDeployment(body, sha, service) {
  return body?.ok === true && body.version === sha && body.service === service;
}
