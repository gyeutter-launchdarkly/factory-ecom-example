import { init, type LDClient, type LDContext } from '@launchdarkly/node-server-sdk';

let ldClient: LDClient | null = null;

async function getClient(): Promise<LDClient | null> {
  const sdkKey = process.env.LD_SDK_KEY;
  if (!sdkKey) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[LD] LD_SDK_KEY not set — flags will return defaults');
    }
    return null;
  }
  if (!ldClient) {
    ldClient = init(sdkKey);
    try {
      await ldClient.waitForInitialization({ timeout: 5 });
    } catch {
      console.warn('[LD] SDK failed to initialize — flags will return defaults');
      ldClient = null;
    }
  }
  return ldClient;
}

function userContext(key: string): LDContext {
  return { kind: 'user', key };
}

// Evaluate a boolean flag. Returns defaultValue when LD is unavailable.
export async function boolVariation(
  flagKey: string,
  userKey: string,
  defaultValue: boolean,
): Promise<boolean> {
  const client = await getClient();
  if (!client) return defaultValue;
  return client.variation(flagKey, userContext(userKey), defaultValue);
}

// Evaluate a string multivariate flag. Returns defaultValue when LD is
// unavailable. Every flag AutoFactory creates is this shape ('control' plus
// 'v1'), so gate on the variation NAME:
//
//   const variant = await stringVariation('catalog-sort-order', userKey, 'control');
//   if (variant === 'v1') { ... }
//
// Passing a multivariate flag through boolVariation compiles and looks right,
// but every non-empty string is truthy, so the control path never runs.
export async function stringVariation(
  flagKey: string,
  userKey: string,
  defaultValue: string,
): Promise<string> {
  const client = await getClient();
  if (!client) return defaultValue;
  return client.variation(flagKey, userContext(userKey), defaultValue);
}

// Track a custom metric event for guarded-release monitoring.
export async function track(
  eventKey: string,
  userKey: string,
  metricValue?: number,
  data?: Record<string, unknown>,
): Promise<void> {
  const client = await getClient();
  if (!client) return;
  client.track(eventKey, userContext(userKey), data ?? null, metricValue);
}
