import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export type DemoVisibility = 'public' | 'private';

/** A catalog entry supplied by a pack, rather than the built-in demo catalog. */
export type PackProduct = {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  category: string;
  emoji: string;
  inventory: number;
  /** Part/SKU code shown above the name, for catalogs that are keyed on one. */
  sku?: string;
  /**
   * Ready-to-render URL. The pack's JSON names a file in its assets/ directory;
   * loading resolves it to the route that serves that directory, so nothing
   * customer-owned has to be copied into public/.
   */
  image?: string;
};

/**
 * Everything a pack needs to look like its own store. Deliberately data only:
 * the public repo carries the renderer, a pack carries the words, colours,
 * images and catalog. No customer markup ever lands here.
 */
export type PackStorefront = {
  brand: { name: string; logo?: string; eyebrow?: string };
  theme: Record<string, string>;
  header: {
    topLinks: string[];
    utilityLinks: string[];
    nav: string[];
    searchPlaceholder?: string;
  };
  hero?: {
    image?: string;
    eyebrow?: string;
    headline?: string;
    searchPlaceholder?: string;
    cta?: string;
  };
  callout?: { title: string; body: string; cta?: string };
  featured?: { eyebrow?: string; title?: string; cta?: string };
  categories?: { title?: string; items: { name: string; image?: string }[] };
  highlights?: { title: string; body: string }[];
  productCta?: string;
  priceNote?: string;
  catalog: PackProduct[];
};

export type DemoPack = {
  id: string;
  name: string;
  visibility: DemoVisibility;
  repository?: string;
  scenarios: string[];
  /** Absent for the built-in pack, which uses the app's own storefront. */
  storefront?: PackStorefront;
};

const SETTINGS = resolve(process.env.FACTORY_SETTINGS_FILE ?? '.autofactory/demo-settings');
const PACKS_DIR = resolve(process.env.FACTORY_PACKS_DIR ?? '.autofactory/packs');

export const DEFAULT_PACK: DemoPack = {
  id: 'default',
  name: 'DarkCommerce',
  visibility: 'public',
  scenarios: [
    'discount-codes',
    'dynamic-pricing',
    'express-checkout',
    'product-ratings',
    'stripe-checkout',
    'tiered-pricing',
  ],
};

/** Asset file names are used to build a URL, so keep them to a plain basename. */
export const ASSET_NAME = /^[A-Za-z0-9._-]{1,80}$/;

export function packAssetUrl(packId: string, file: string | undefined): string | undefined {
  if (!file || !ASSET_NAME.test(file) || file.startsWith('.')) return undefined;
  return `/api/demo-pack/assets/${encodeURIComponent(file)}?pack=${encodeURIComponent(packId)}`;
}

export function packAssetPath(packId: string, file: string): string | null {
  if (!/^[a-z0-9-]{1,64}$/.test(packId)) return null;
  if (!ASSET_NAME.test(file) || file.startsWith('.')) return null;
  return join(PACKS_DIR, packId, 'assets', file);
}

async function selectedPackId(): Promise<string> {
  try {
    const text = await readFile(SETTINGS, 'utf8');
    const value = text.match(/^DEMO_PACK=(.+)$/m)?.[1]?.trim();
    return value && /^[a-z0-9-]{1,64}$/.test(value) ? value : DEFAULT_PACK.id;
  } catch {
    return DEFAULT_PACK.id;
  }
}

function validPack(value: unknown, id: string): value is DemoPack {
  if (!value || typeof value !== 'object') return false;
  const pack = value as Partial<DemoPack>;
  return (
    pack.id === id &&
    typeof pack.name === 'string' &&
    (pack.visibility === 'public' || pack.visibility === 'private') &&
    (!pack.repository || typeof pack.repository === 'string')
  );
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function products(value: unknown, packId: string): PackProduct[] {
  if (!Array.isArray(value)) return [];
  const out: PackProduct[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = text(item.id);
    const name = text(item.name);
    const price = typeof item.basePrice === 'number' ? item.basePrice : NaN;
    // A catalog entry without an id, a name or a price cannot be rendered or
    // added to a cart, so drop it rather than ship a broken card mid-demo.
    if (!id || !name || !Number.isFinite(price) || price < 0) continue;
    out.push({
      id,
      name,
      description: text(item.description) ?? '',
      basePrice: price,
      category: text(item.category) ?? 'general',
      emoji: text(item.emoji) ?? '📦',
      inventory: typeof item.inventory === 'number' ? item.inventory : 0,
      ...(text(item.sku) ? { sku: text(item.sku) as string } : {}),
      ...(packAssetUrl(packId, text(item.image))
        ? { image: packAssetUrl(packId, text(item.image)) as string }
        : {}),
    });
  }
  return out;
}

/**
 * A pack's storefront.json. Operator-authored and local, but still validated:
 * a typo should fall back to the built-in store rather than blank the page in
 * front of a customer.
 */
async function storefront(packId: string): Promise<PackStorefront | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(PACKS_DIR, packId, 'storefront.json'), 'utf8'));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const raw = parsed as Record<string, unknown>;

  const brand = (raw.brand ?? {}) as Record<string, unknown>;
  const brandName = text(brand.name);
  if (!brandName) return undefined;

  const theme: Record<string, string> = {};
  for (const [key, value] of Object.entries((raw.theme ?? {}) as Record<string, unknown>)) {
    if (typeof value === 'string' && /^[A-Za-z0-9#(),.%\s-]{1,64}$/.test(value)) theme[key] = value;
  }

  const header = (raw.header ?? {}) as Record<string, unknown>;
  const hero = (raw.hero ?? {}) as Record<string, unknown>;
  const callout = (raw.callout ?? {}) as Record<string, unknown>;
  const featured = (raw.featured ?? {}) as Record<string, unknown>;
  const categories = (raw.categories ?? {}) as Record<string, unknown>;

  const categoryItems: { name: string; image?: string }[] = [];
  for (const raw of Array.isArray(categories.items) ? categories.items : []) {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const name = text(item.name);
    if (!name) continue;
    const image = packAssetUrl(packId, text(item.image));
    categoryItems.push({ name, ...(image ? { image } : {}) });
  }

  const highlights: { title: string; body: string }[] = [];
  for (const raw2 of Array.isArray(raw.highlights) ? raw.highlights : []) {
    const item = (raw2 && typeof raw2 === 'object' ? raw2 : {}) as Record<string, unknown>;
    const title = text(item.title);
    const body = text(item.body);
    if (title && body) highlights.push({ title, body });
  }

  return {
    brand: {
      name: brandName,
      ...(packAssetUrl(packId, text(brand.logo))
        ? { logo: packAssetUrl(packId, text(brand.logo)) as string }
        : {}),
      ...(text(brand.eyebrow) ? { eyebrow: text(brand.eyebrow) as string } : {}),
    },
    theme,
    header: {
      topLinks: strings(header.topLinks),
      utilityLinks: strings(header.utilityLinks),
      nav: strings(header.nav),
      ...(text(header.searchPlaceholder)
        ? { searchPlaceholder: text(header.searchPlaceholder) as string }
        : {}),
    },
    ...(Object.keys(hero).length > 0
      ? {
          hero: {
            ...(packAssetUrl(packId, text(hero.image))
              ? { image: packAssetUrl(packId, text(hero.image)) as string }
              : {}),
            ...(text(hero.eyebrow) ? { eyebrow: text(hero.eyebrow) as string } : {}),
            ...(text(hero.headline) ? { headline: text(hero.headline) as string } : {}),
            ...(text(hero.searchPlaceholder)
              ? { searchPlaceholder: text(hero.searchPlaceholder) as string }
              : {}),
            ...(text(hero.cta) ? { cta: text(hero.cta) as string } : {}),
          },
        }
      : {}),
    ...(text(callout.title) && text(callout.body)
      ? {
          callout: {
            title: text(callout.title) as string,
            body: text(callout.body) as string,
            ...(text(callout.cta) ? { cta: text(callout.cta) as string } : {}),
          },
        }
      : {}),
    featured: {
      ...(text(featured.eyebrow) ? { eyebrow: text(featured.eyebrow) as string } : {}),
      ...(text(featured.title) ? { title: text(featured.title) as string } : {}),
      ...(text(featured.cta) ? { cta: text(featured.cta) as string } : {}),
    },
    ...(categoryItems.length > 0
      ? {
          categories: {
            ...(text(categories.title) ? { title: text(categories.title) as string } : {}),
            items: categoryItems,
          },
        }
      : {}),
    ...(highlights.length > 0 ? { highlights } : {}),
    ...(text(raw.productCta) ? { productCta: text(raw.productCta) as string } : {}),
    ...(text(raw.priceNote) ? { priceNote: text(raw.priceNote) as string } : {}),
    catalog: products(raw.catalog, packId),
  };
}

/** Customer packs live under the ignored .autofactory directory. */
export async function demoPack(): Promise<DemoPack> {
  const id = await selectedPackId();
  if (id === DEFAULT_PACK.id) return DEFAULT_PACK;
  try {
    const parsed = JSON.parse(await readFile(join(PACKS_DIR, id, 'pack.json'), 'utf8')) as unknown;
    if (!validPack(parsed, id)) return DEFAULT_PACK;
    const files = await readdir(join(PACKS_DIR, id, 'events')).catch(() => []);
    const front = await storefront(id);
    return {
      ...parsed,
      scenarios: files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5)).sort(),
      ...(front ? { storefront: front } : {}),
    };
  } catch {
    return DEFAULT_PACK;
  }
}

export function scenarioBelongsToPack(scenario: string, pack: DemoPack): boolean {
  return pack.scenarios.includes(scenario);
}
