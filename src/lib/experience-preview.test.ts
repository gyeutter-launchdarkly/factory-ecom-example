import { expect, it } from 'vitest';
import { previewDiscount } from './experience-preview';
it('calculates scenario savings in cents without floating point totals', () => {
  expect(previewDiscount(' save10 ', 149.99)).toEqual({
    code: 'SAVE10',
    saving: 15,
    total: 134.99,
  });
  expect(previewDiscount('LAUNCH20', 149.99)).toEqual({
    code: 'LAUNCH20',
    saving: 30,
    total: 119.99,
  });
});
it('rejects invalid codes, prototype properties, and non-finite totals', () => {
  for (const code of ['nope', 'constructor', '__proto__', 'toString'])
    expect(previewDiscount(code, 100)).toBeNull();
  expect(previewDiscount('SAVE10', NaN)).toBeNull();
});
