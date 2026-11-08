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

test('in the list, a selected event unfolds in place', async ({ page }) => {
  await page.goto('/#/list?e=mit-iquhack-2027');
  const card = page.locator('article.card.open');
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Sources')).toBeVisible();
  await card.getByRole('button', { name: 'Collapse details' }).click();
  await expect(page.locator('article.card.open')).toHaveCount(0);
});

test('on the timeline, a deep link opens the details panel', async ({ page }) => {
  await page.goto('/#/timeline?e=mit-iquhack-2027');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'MIT iQuHACK 2027' })).toBeVisible();
  await expect(dialog.getByText('Sources')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('unknown values say "Not found yet"', async ({ page }) => {
  await page.goto('/#/timeline?e=sesame-quantum-hackathon-2026');
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

test('a list card shows the essentials; "More details" opens everything in a pop-up', async ({
  page,
}) => {
  await page.goto('/#/list?e=mit-iquhack-2027');
  const card = page.locator('article.card.open');
  await expect(card.getByText('Travel support')).toHaveCount(0);
  await card.getByRole('button', { name: 'More details' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Travel support')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('article.card.open')).toHaveCount(1);
});

test('explore: hovering an event does not scroll the timeline', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Explore side by side is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  const scroller = page.locator('.timeline-pane .scroller');
  await page.waitForTimeout(300);
  const before = await scroller.evaluate((el) => [el.scrollLeft, el.scrollTop]);
  await page.locator('.list-pane article.card').nth(8).hover();
  await page.waitForTimeout(600);
  expect(await scroller.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual(before);
});

test('the timeline zooms step by step', async ({ page }) => {
  await page.goto('/#/timeline');
  const quarter = page.getByRole('button', { name: 'quarter' });
  await expect(quarter).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Zoom in' }).last().click();
  await expect(quarter).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Zoom out' }).last().click();
  await expect(quarter).toHaveAttribute('aria-pressed', 'true');
});

test('filter groups start folded, except the top ones', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The filter sidebar is the desktop layout');
  await page.goto('/#/list');
  await expect(page.getByRole('button', { name: 'When' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Topic' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('narrow window: scrolling over the list scrolls the page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Wheel scrolling is a desktop gesture');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/#/explore');
  await page.locator('.list-pane article.card').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 1000));
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(500, 500);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

test('explore: a hidden list stays hidden; clicking the map opens the details pop-up', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The workspace is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  await page.getByRole('button', { name: 'Hide list' }).click();
  await expect(page.locator('.list-pane')).toHaveCount(0);
  await page.locator('.map-pane g.dot').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.list-pane')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^List \(/ })).toBeVisible();
});

test('explore: the list border can be resized from the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The workspace is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  const list = page.locator('.list-pane');
  const before = (await list.boundingBox())!.width;
  await page.getByRole('separator', { name: 'Resize the list' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await list.boundingBox())!.width).toBeGreaterThan(before);
});

test('the online button on the map switches the online-only filter on and off', async ({
  page,
}) => {
  await page.goto('/#/explore');
  const online = page.getByRole('button', { name: /online$/ });
  await expect(online).toHaveAttribute('aria-pressed', 'false');
  await online.click();
  await expect(online).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/online/);
  await online.click();
  await expect(online).toHaveAttribute('aria-pressed', 'false');
  await expect(page).not.toHaveURL(/online/);
});
