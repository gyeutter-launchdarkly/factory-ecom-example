import { test, expect } from '@playwright/test';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
const stream = '.autofactory/e2e.ndjson';
test.beforeAll(async () => {
  await mkdir('.autofactory', { recursive: true });
  await writeFile(stream, '');
});
test('steps-only journey, accessible evidence, and responsive layout', async ({
  page,
}) => {
  await page.goto('/');
  for (const name of ['Write it.', 'Release it.', 'Run it.'])
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toHaveCount(0);
  await expect(page.getByText('Build Control', { exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Guard release: Not observed', exact: true })
    .click();
  await expect(
    page.getByText('A manifest alone does not mean', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close step details' }).click();
  await expect(
    page.getByRole('region', { name: 'Guard release evidence' }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 820, height: 900 });
  await expect(
    page.getByRole('button', { name: 'Production: Not observed', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/journey-laptop.png',
    fullPage: true,
  });
});
test('catalog to cart to checkout preserves typing focus and confirms an order', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide factory panel' }).click();
  await page.getByRole('button', { name: /add/i }).first().click();
  await page.goto('/checkout');
  await expect(
    page.getByRole('heading', { name: 'Checkout', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Full name').pressSequentially('Demo Shopper');
  await expect(page.getByLabel('Full name')).toHaveValue('Demo Shopper');
  await page.getByRole('button', { name: 'Autofill demo details' }).click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(
    page.getByRole('heading', { name: 'Order confirmed' }),
  ).toBeVisible();
});
test('replay remains labeled and a failure never completes production', async ({
  page,
}) => {
  await page.goto('/');
  const run = 'express-checkout-e2e';
  const events = [
    { t: 'run-start' },
    { t: 'mode', mode: 'rehearsal' },
    { t: 'node', key: 'autofactory-flag-implementer', status: 'done' },
    { t: 'verdict', approved: false },
    { t: 'run-done' },
  ];
  await appendFile(
    stream,
    events
      .map((event, seq) =>
        JSON.stringify({
          run,
          scenario: 'express-checkout',
          at: Date.now(),
          seq,
          ...event,
        }),
      )
      .join('\n') + '\n',
  );
  await expect(
    page
      .locator('span.factory-mode')
      .filter({ hasText: 'Rehearsal · simulated' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review: Stopped', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Production: Not observed', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Review: Stopped', exact: true }),
  ).toBeVisible();
});

test('scenario selection follows the current run once and survives controller polling', async ({ page }) => {
  await page.route('**/api/factory-control', route => route.fulfill({ json: {
    available: true, busy: false,
    scenarios: [{ key: 'discount-codes', title: 'Discount codes' }, { key: 'express-checkout', title: 'Express checkout' }],
  } }));
  await page.goto('/');
  const select = page.getByRole('combobox', { name: 'Scenario to run' });
  await expect(select).toHaveValue('express-checkout');
  await select.selectOption('discount-codes');
  await page.waitForResponse(response => response.url().endsWith('/api/factory-control'));
  await expect(select).toHaveValue('discount-codes');
});
