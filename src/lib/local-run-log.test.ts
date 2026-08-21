import { describe, expect, it } from 'vitest';
import { safeRunId } from './local-run-log';

describe('local run log path', () => {
  it('accepts generated run ids', () => {
    expect(safeRunId('express-checkout-local-1787341146000')).toBe(true);
  });

  it.each([
    '../secrets',
    'run/../../secrets',
    'run%2f..%2fsecrets',
    '.',
    '',
    'UPPERCASE',
    'run name',
  ])('rejects %s', (value) => {
    expect(safeRunId(value)).toBe(false);
  });
});

