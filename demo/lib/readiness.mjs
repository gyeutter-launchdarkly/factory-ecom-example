export function readiness(env, tools) {
  const present = (key) => {
    const value = env[key]?.trim();
    return !!value && !['api-', 'sdk-', 'sk-ant-', 'changeme'].includes(value);
  };
  const configuration = (keys) => keys.filter((key) => !present(key));
  const base = ['node', 'bash', 'jq', 'git'].filter((key) => !tools[key]);
  const sequence = tools.liveSequence
    ? []
    : ['Ordered live adapters (FACTORY_LIVE_CONFIG)'];
  const github = [
    ...base,
    ...(!tools.gh
      ? ['gh']
      : !tools.github
        ? ['GitHub sign-in (gh auth login)']
        : []),
  ];
  const release = configuration([
    'LD_API_KEY',
    'LD_APP_PROJECT_KEY',
    'FACTORY_STORE_URL',
    'FACTORY_RELEASE_FLAG',
    'FACTORY_RELEASE_ID',
  ]);
  if (present('FACTORY_STORE_URL')) {
    try {
      const url = new URL(env.FACTORY_STORE_URL);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        release.push('Valid FACTORY_STORE_URL');
    } catch {
      release.push('Valid FACTORY_STORE_URL');
    }
  }
  const mode = (missing) => ({ ready: missing.length === 0, missing });
  return {
    at: Date.now(),
    modes: {
      rehearsal: mode(base),
      recorded: mode(base),
      factory: mode([...github, ...sequence]),
      hosted: mode([
        ...github,
        ...sequence,
        ...configuration(['LD_API_KEY', 'LD_APP_PROJECT_KEY']),
      ]),
      local: mode([
        ...base,
        ...sequence,
        ...configuration([
          'LD_API_KEY',
          'LD_SDK_KEY',
          'ANTHROPIC_API_KEY',
          'LD_APP_PROJECT_KEY',
        ]),
        ...(!tools.cli ? ['Built AutoFactory CLI (AUTOFACTORY_DIR)'] : []),
      ]),
    },
    release: mode([...github, ...release]),
    note: 'Local prerequisites only. Repository access, remote secrets, SDK connectivity, and rollout permissions are verified by the live run.',
  };
}
