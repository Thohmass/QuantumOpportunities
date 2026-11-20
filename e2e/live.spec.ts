import { test, expect, type Page } from '@playwright/test';

// Today's data (data/) in the real site: every view loads, shows events and throws no errors. No counts or names,
// so new events can't break it; the behaviour tests run on frozen data (smoke.spec.ts).
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('the list shows today’s events without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/list');
  await expect(page.locator('article.card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('every event opens without errors', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const events: { id: string }[] = await (await page.request.get('/data/events.json')).json();
  expect(events.length).toBeGreaterThan(0);
  for (const { id } of events) {
    await page.goto(`/#/list?past=1&e=${id}`);
    await expect(page.locator('article.card.open'), id).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

for (const view of ['timeline', 'map', 'explore', 'about']) {
  test(`the ${view} view loads without errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/#/${view}`);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}
