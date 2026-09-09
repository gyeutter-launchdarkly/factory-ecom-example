'use client';
import { useState } from 'react';
import { formatPrice } from '@/lib/pricing';
import { previewDiscount } from '@/lib/experience-preview';
import type { Product } from '@/lib/products';

export function ExperienceComparison({ product }: { product: Product }) {
  const [code, setCode] = useState('SAVE10');
  const [applied, setApplied] =
    useState<ReturnType<typeof previewDiscount>>(null);
  const [error, setError] = useState('');
  return (
    <div className="comparison-grid">
      {(['before', 'after'] as const).map((side) => (
        <section
          key={side}
          className={`comparison-card comparison-${side}`}
          aria-label={`${side === 'before' ? 'Before' : 'After'} experience`}
        >
          <div className="comparison-card-head">
            <span>{side === 'before' ? '01 / Before' : '02 / After'}</span>
            <strong>
              {side === 'before'
                ? 'Standard checkout'
                : 'A reason to complete the order'}
            </strong>
          </div>
          <div className="comparison-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {product.image && (
              <img
                src={product.image}
                alt={product.name}
                width={140}
                height={105}
              />
            )}
            <div>
              <strong>{product.name}</strong>
              <p>Quantity 1</p>
              <span>{formatPrice(product.basePrice)}</span>
            </div>
          </div>
          {side === 'after' ? (
            <form
              className="comparison-code"
              onSubmit={(event) => {
                event.preventDefault();
                const result = previewDiscount(code, product.basePrice);
                setApplied(result);
                setError(
                  result
                    ? ''
                    : 'That code isn’t valid. Try SAVE10, LAUNCH20, or DEMO.',
                );
              }}
            >
              <label htmlFor="preview-code">Discount code</label>
              <div>
                <input
                  id="preview-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setApplied(null);
                    setError('');
                  }}
                  maxLength={40}
                />
                <button type="submit">Apply</button>
              </div>
              <p aria-live="polite">
                {error ||
                  (applied
                    ? `${applied.code} applied. You save ${formatPrice(applied.saving)}.`
                    : 'Try SAVE10 for 10% off.')}
              </p>
            </form>
          ) : (
            <div className="comparison-baseline">
              The original checkout has no place to apply a promotional code.
            </div>
          )}
          <dl className="comparison-total">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(product.basePrice)}</dd>
            </div>
            {side === 'after' && applied && (
              <div className="comparison-saving">
                <dt>Savings</dt>
                <dd>−{formatPrice(applied.saving)}</dd>
              </div>
            )}
            <div>
              <dt>Total</dt>
              <dd>
                {formatPrice(
                  side === 'after' && applied
                    ? applied.total
                    : product.basePrice,
                )}
              </dd>
            </div>
          </dl>
        </section>
      ))}
    </div>
  );
}
