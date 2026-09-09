import Link from 'next/link';
import { activeCatalog } from '@/lib/catalog';
import { ExperienceComparison } from '@/components/ExperienceComparison';
export const dynamic = 'force-dynamic';
export default async function ComparePage() {
  const { products } = await activeCatalog();
  const product = products[0];
  return (
    <div className="comparison-page">
      <Link href="/" className="comparison-back">
        ← Back to the store
      </Link>
      <div className="comparison-intro">
        <span className="comparison-eyebrow">
          Experience preview · discount codes
        </span>
        <h1>See what changes for the customer.</h1>
        <p>
          The same product. The same checkout. A promotional code gives the
          customer a lower total.
        </p>
      </div>
      {product ? (
        <ExperienceComparison product={product} />
      ) : (
        <p>No products are available in this demo pack.</p>
      )}
      <p className="comparison-disclosure">
        Interactive scenario preview. These example states do not change live
        flags, place orders, or verify a deployment. Use the Factory panel’s
        release evidence to confirm what reached customers.
      </p>
    </div>
  );
}
