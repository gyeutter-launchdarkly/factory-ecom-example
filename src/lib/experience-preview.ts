/** Illustrative discount-codes scenario. Never writes an order or emits release evidence. */
export function previewDiscount(code: string, subtotal: number) {
  const codes: Record<string, number> = {
    SAVE10: 0.1,
    LAUNCH20: 0.2,
    DEMO: 0.15,
  };
  const normalized = code.trim().toUpperCase();
  const percentage = Object.hasOwn(codes, normalized)
    ? codes[normalized]
    : undefined;
  if (percentage === undefined || !Number.isFinite(subtotal) || subtotal < 0)
    return null;
  const subtotalCents = Math.round(subtotal * 100);
  const savingCents = Math.round(subtotalCents * percentage);
  return {
    code: normalized,
    saving: savingCents / 100,
    total: (subtotalCents - savingCents) / 100,
  };
}
