import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type DemoProfile = 'commerce' | 'cat';

const SETTINGS = resolve(process.env.FACTORY_SETTINGS_FILE ?? '.autofactory/demo-settings');

export function isDemoProfile(value: unknown): value is DemoProfile {
  return value === 'commerce' || value === 'cat';
}

/** The TUI owns this setting; the app only reads the shared bind mount. */
export async function demoProfile(): Promise<DemoProfile> {
  try {
    const text = await readFile(SETTINGS, 'utf8');
    const value = text.match(/^DEMO_PROFILE=(.+)$/m)?.[1]?.trim();
    return isDemoProfile(value) ? value : 'commerce';
  } catch {
    return 'commerce';
  }
}

export const PROFILE_SCENARIOS: Record<DemoProfile, readonly string[]> = {
  commerce: [
    'discount-codes',
    'dynamic-pricing',
    'express-checkout',
    'product-ratings',
    'stripe-checkout',
    'tiered-pricing',
  ],
  // These existing feature branches make sense on a heavy-equipment parts
  // storefront and are known-good before the customer demo. A later CAT-only
  // branch can be added simply by prefixing it `cat-`.
  cat: ['dynamic-pricing', 'tiered-pricing'],
};

export function scenarioBelongsToProfile(scenario: string, profile: DemoProfile): boolean {
  if (scenario.startsWith('cat-')) return profile === 'cat';
  return PROFILE_SCENARIOS[profile].includes(scenario);
}
