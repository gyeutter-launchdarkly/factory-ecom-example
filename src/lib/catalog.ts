import { demoPack } from './demo-pack';
import { PRODUCTS, type Product } from './products';

/**
 * The catalog the store is currently selling: a pack's own products when it
 * ships one, otherwise the built-in demo catalog. Server-side only — it reads
 * the pack from disk.
 */
export async function activeCatalog(): Promise<{ packId: string; products: Product[] }> {
  const pack = await demoPack();
  const catalog = pack.storefront?.catalog ?? [];
  return { packId: pack.id, products: catalog.length > 0 ? catalog : PRODUCTS };
}

/** Resolve a product id against whichever catalog is live, for cart/checkout. */
export async function resolveProduct(id: string): Promise<Product | undefined> {
  const { products } = await activeCatalog();
  return products.find((product) => product.id === id);
}
