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
    await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(
      0,
    );
  await expect(page.getByText('Build Control', { exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Guard release: Waiting', exact: true })
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
    page.getByRole('button', { name: 'Production: Waiting', exact: true }),
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
    page.getByRole('button', { name: 'Production: Waiting', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Review: Stopped', exact: true }),
  ).toBeVisible();
});

test('scenario selection follows the current run once and survives controller polling', async ({
  page,
}) => {
  await page.route('**/api/factory-control', (route) =>
    route.fulfill({
      json: {
        available: true,
        busy: false,
        scenarios: [
          { key: 'discount-codes', title: 'Discount codes' },
          { key: 'express-checkout', title: 'Express checkout' },
        ],
      },
    }),
  );
  await page.goto('/');
  const select = page.getByRole('combobox', { name: 'Scenario to run' });
  await expect(select).toHaveValue('express-checkout');
  await select.selectOption('discount-codes');
  await page.waitForResponse((response) =>
    response.url().endsWith('/api/factory-control'),
  );
  await expect(select).toHaveValue('discount-codes');
});

test('catalog errors recover and generated product images load', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/products', (route) =>
    fail
      ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
      : route.continue(),
  );
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'couldn’t load',
  );
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const picture = page.getByRole('img', {
    name: 'Wireless Headphones',
    exact: true,
  });
  await expect(picture).toBeVisible();
  await expect
    .poll(() =>
      picture.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const add = page.getByRole('button', {
    name: 'Add Wireless Headphones to bag',
    exact: true,
  });
  await add.focus();
  await expect(add).toBeVisible();
  await add.press('Enter');
  await expect(add).toHaveText('Added · add another');
});

test('before and after comparison shows savings and rejects invalid codes', async ({
  page,
}) => {
  await page.goto('/compare');
  await page.getByRole('button', { name: 'Hide factory panel' }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'After experience' }),
  ).toContainText('$134.99');
  await expect(
    page.getByRole('region', { name: 'Before experience' }),
  ).not.toContainText('$134.99');
  await page.getByLabel('Discount code').fill('invalid');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(
    page.getByText('That code isn’t valid.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'After experience' }),
  ).not.toContainText('$134.99');
  await expect(
    page.getByText('Interactive scenario preview.', { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('missing prerequisites explain why a live run is disabled', async ({
  page,
}) => {
  await page.route('**/api/factory-control', (route) =>
    route.fulfill({
      json: {
        available: true,
        busy: false,
        scenarios: [{ key: 'discount-codes', title: 'Discount codes' }],
        runtime: {
          mode: 'hosted',
          strategy: 'new',
          pack: 'default',
          packName: 'Default',
          visibility: 'public',
        },
        readiness: {
          at: Date.now(),
          modes: { hosted: { ready: false, missing: ['LD_API_KEY'] } },
          release: { ready: false, missing: ['FACTORY_STORE_URL'] },
          note: 'Local prerequisites only.',
        },
      },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Run Scenario', exact: true }),
  ).toBeDisabled();
  await page.getByText('Setup needed', { exact: true }).click();
  await expect(
    page.getByText('Missing: LD_API_KEY', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('live delivery moves from approval to verified store and exposes rollback', async ({
  page,
}) => {
  await page.goto('/');
  const run = 'discount-codes-delivery-e2e';
  let seq = 0;
  async function emit(events: Record<string, unknown>[]) {
    await appendFile(
      stream,
      events
        .map((event) =>
          JSON.stringify({
            run,
            scenario: 'discount-codes',
            at: Date.now(),
            seq: seq++,
            ...event,
          }),
        )
        .join('\n') + '\n',
    );
  }
  await emit([
    { t: 'run-start' },
    { t: 'mode', mode: 'hosted' },
    { t: 'repo', repo: 'example/demo' },
    { t: 'pr', number: 42 },
    { t: 'verdict', approved: true },
    { t: 'run-done' },
  ]);
  const summary = page.locator('.delivery-summary');
  await expect(summary).toContainText('Review approved · awaiting merge');
  await expect(
    page.getByRole('link', { name: 'Open PR & verdict' }),
  ).toHaveAttribute('href', 'https://github.com/example/demo/pull/42');
  await expect(
    page.getByRole('link', { name: 'Open released store' }),
  ).toHaveCount(0);
  await emit([
    { t: 'run-resume' },
    { t: 'node', key: 'ext-merge', status: 'done' },
    { t: 'node', key: 'ext-deploy', status: 'done' },
  ]);
  await expect(summary).toContainText('Deployed · awaiting rollout');
  await expect(
    page.getByRole('link', { name: 'Open released store' }),
  ).toHaveCount(0);
  await emit([
    {
      t: 'resource',
      kind: 'store',
      key: 'sha',
      station: 'ext-deploy',
      url: 'https://store.example.com',
      label: 'Open deployed store',
    },
    { t: 'node', key: 'ld-outcome', status: 'done' },
  ]);
  await expect(summary).toContainText('Released to customers');
  await expect(
    page.getByRole('link', { name: 'Open released store' }),
  ).toHaveAttribute('href', 'https://store.example.com');
  await emit([{ t: 'node', key: 'ld-outcome', status: 'failed' }]);
  await expect(summary).toContainText('Release stopped');
  await expect(
    page.getByRole('link', { name: 'Open released store' }),
  ).toHaveCount(0);
});
