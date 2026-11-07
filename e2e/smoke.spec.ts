import { test, expect } from '@playwright/test';

test('home page loads with events', async ({ page }) => {
  await page.goto('/#/list');
  await expect(page).toHaveTitle(/Quantum Opportunities/);
  await expect(page.locator('article.card').first()).toBeVisible();
});

test('search filters the list and is kept in the URL', async ({ page }) => {
  await page.goto('/#/list');
  await page.getByPlaceholder(/Search events/).fill('singapore');
  await expect(page.locator('article.card')).toHaveCount(1);
  await expect(page.locator('article.card')).toContainText('QIP 2027');
  await expect(page).toHaveURL(/q=singapore/);
});

test('a deep link opens the event details', async ({ page }) => {
  await page.goto('/#/list?e=mit-iquhack-2027');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'MIT iQuHACK 2027' })).toBeVisible();
  await expect(dialog.getByText('Sources')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('unknown values say "Not found yet"', async ({ page }) => {
  await page.goto('/#/list?e=sesame-quantum-hackathon-2026');
  await expect(page.getByRole('dialog').getByText('Not found yet').first()).toBeVisible();
});

test('clicking a month on the timeline selects it as the date filter', async ({ page }) => {
  await page.goto('/#/timeline');
  await page
    .getByRole('button', { name: /^Select February/ })
    .first()
    .click();
  await expect(page).toHaveURL(/when=custom/);
  await expect(page.getByRole('button', { name: 'Clear dates ×' })).toBeVisible();
});

test('explore: hovering a list card highlights the event on the timeline', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Explore is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  const card = page.locator('.list-pane article.card').first();
  await card.hover();
  await expect(page.locator('.timeline-pane button.item.hot')).toHaveCount(1);
});
