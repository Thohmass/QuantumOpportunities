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

// Changed in v0.7 (owner's request): the Week / Month / Quarter / Year / Today buttons were removed; only − / +.
test('the timeline zooms step by step', async ({ page }) => {
  await page.goto('/#/timeline');
  const month = page.getByRole('button', { name: /^Select / }).first();
  const width = async () => (await month.boundingBox())!.width;
  const before = await width();
  await page.getByRole('button', { name: 'Zoom in' }).last().click();
  await expect.poll(width).toBeGreaterThan(before * 1.3);
  await page.getByRole('button', { name: 'Zoom out' }).last().click();
  await expect.poll(width).toBeLessThan(before * 1.1);
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

// Changed in v0.6 (owner's request): on narrow windows the list is a drawer, not part of the page.
test('narrow window: the list is a drawer that scrolls on its own', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Wheel scrolling is a desktop gesture');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/#/explore');
  await expect(page.locator('.list-pane')).toHaveCount(0);
  await page.getByRole('button', { name: /^List/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Events' });
  await drawer.locator('article.card').first().waitFor();
  await page.mouse.move(800, 500);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => drawer.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
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

test('timeline: weeks are labels only; a selected month is lit to its exact days', async ({
  page,
}) => {
  await page.goto('/#/timeline');
  await expect(page.getByRole('button', { name: /^Select week/ })).toHaveCount(0);
  const jan = page.getByRole('button', { name: /^Select January 2027/ });
  await jan.click();
  const cell = (await jan.boundingBox())!;
  const band = (await page.locator('.head-band').first().boundingBox())!;
  expect(Math.abs(band.x - cell.x)).toBeLessThan(2);
  expect(Math.abs(band.width - cell.width)).toBeLessThan(2);
});

test('explore on desktop fills the window to its bottom edge', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The workspace is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  await page.locator('.list-pane article.card').first().waitFor();
  const bottom = await page
    .locator('.list-pane')
    .evaluate((el) => el.getBoundingClientRect().bottom);
  expect(Math.abs(bottom - 900)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBe(0);
});

test('search: Enter keeps a term as a chip and clears the box; suggestions set filters', async ({
  page,
}) => {
  await page.goto('/#/explore');
  const box = page.getByPlaceholder(/Search events/);
  await box.fill('germ');
  const option = page.getByRole('option', { name: /Germany/ });
  await expect(option).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/country=DE/);
  await expect(box).toHaveValue('');
  await box.fill('hackathon berlin');
  await page.getByRole('option', { name: /Search all text/ }).click();
  await expect(page).toHaveURL(/k=hackathon/);
  await expect(box).toHaveValue('');
});

test('panels expand and shrink back into Explore', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The workspace is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  await page.getByRole('button', { name: 'Expand the timeline' }).click();
  await expect(page).toHaveURL(/#\/timeline/);
  await page.getByRole('button', { name: 'Shrink the timeline' }).click();
  await expect(page).toHaveURL(/#\/explore/);
  await page.getByRole('button', { name: 'Expand the list' }).click();
  await expect(page.locator('section.list.columns')).toHaveCount(1);
});

test('expanded map: selecting an event opens the list drawer with its card', async ({ page }) => {
  await page.goto('/#/map?e=saarland-qit-summer-school-2027');
  const drawer = page.getByRole('dialog', { name: 'Events' });
  await expect(drawer.locator('article.card.open')).toContainText('Saarland');
  await expect(page.locator('g.dot .bubble.big').first()).toBeAttached();
});

test('map: the wheel zooms smoothly, and expanding keeps the view', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse wheel is a desktop gesture');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  // Zoom in over an event (Europe is the densest area).
  const dot = (await page.locator('.map-pane g.dot').nth(20).boundingBox())!;
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  await expect(page.locator('g.dot .bubble.big').first()).toBeAttached({ timeout: 3000 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Expand the map' }).click();
  await expect(page).toHaveURL(/#\/map/);
  await expect(page.locator('g.dot .bubble.big').first()).toBeAttached();
});

test('phones: the list drawer follows the finger (pull the tab, swipe to close)', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Touch gesture on phones');
  await page.goto('/#/explore');
  const swipe = async (selector: string, from: [number, number], to: [number, number]) =>
    page.evaluate(
      ({ selector, from, to }) => {
        const el = document.querySelector(selector)!;
        const touch = (x: number, y: number) =>
          new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
        const fire = (type: string, x: number, y: number, list = true) =>
          el.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches: list ? [touch(x, y)] : [],
              changedTouches: [touch(x, y)],
            }),
          );
        fire('touchstart', ...from);
        for (let i = 1; i <= 6; i++)
          fire(
            'touchmove',
            from[0] + ((to[0] - from[0]) * i) / 6,
            from[1] + ((to[1] - from[1]) * i) / 6,
          );
        fire('touchend', ...to, false);
      },
      { selector, from, to },
    );
  const w = page.viewportSize()!.width;
  await page.locator('.pull-tab').waitFor();
  await swipe('.pull-tab', [w - 10, 500], [w - 300, 505]);
  const drawer = page.getByRole('dialog', { name: 'Events' });
  await expect(drawer).toBeVisible();
  await page.waitForTimeout(300);
  await swipe('.list-drawer', [80, 400], [w - 20, 410]);
  await expect(drawer).toBeHidden();
});

test('selecting a visible card does not scroll the list', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The workspace is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  const pane = page.locator('.list-pane');
  await pane.locator('article.card').nth(1).click();
  await page.waitForTimeout(500);
  expect(await pane.evaluate((el) => el.scrollTop)).toBe(0);
});

test('closing the list drawer deselects the event, so it can be selected again', async ({
  page,
}) => {
  await page.goto('/#/timeline');
  const item = page.locator('button.item').first();
  const drawer = page.getByRole('dialog', { name: 'Events' });
  await item.click();
  await expect(drawer.locator('article.card.open')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close the list' }).click();
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/e=/);
  await expect(page.locator('button.item.picked')).toHaveCount(0);
  await item.click();
  await expect(drawer.locator('article.card.open')).toHaveCount(1);
});

test('wide windows: the drawer leaves the app usable; clicking empty space deselects and rolls it back', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Wide window');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/map');
  const drawer = page.getByRole('dialog', { name: 'Events' });
  await page.locator('g.dot').first().click();
  await expect(drawer).toBeVisible();
  await expect(page.locator('.drawer-scrim')).toHaveCount(0);
  // Another event can be picked straight away, with the drawer open.
  await page.locator('g.dot').nth(10).click();
  await expect(drawer.locator('article.card.open')).toHaveCount(1);
  // Empty sea in the bottom-left corner of the map.
  const box = (await page.locator('svg[role="img"]').boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + box.height - 20);
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/e=/);
});

test('explore: clicking empty timeline space deselects the event', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The workspace is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  await page.locator('.list-pane article.card').first().click();
  await expect(page.locator('.list-pane article.card.open')).toHaveCount(1);
  const tl = (await page.locator('.timeline-pane .scroller').boundingBox())!;
  await page.mouse.click(tl.x + tl.width - 60, tl.y + tl.height - 30);
  await expect(page.locator('.list-pane article.card.open')).toHaveCount(0);
});

test('the list drawer keeps its scroll position when it is closed and opened again', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Wheel scrolling is a desktop gesture');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/#/explore');
  const list = page.getByRole('button', { name: /^List/ });
  await list.click();
  const drawer = page.getByRole('dialog', { name: 'Events' });
  await drawer.locator('article.card').first().waitFor();
  await page.mouse.move(800, 500);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => drawer.evaluate((el) => el.scrollTop)).toBeGreaterThan(300);
  const top = await drawer.evaluate((el) => el.scrollTop);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await list.click();
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((el) => el.scrollTop)).toBe(top);
});

test('timeline: one band of rows per event type; names only where they fit; pointing opens a name line', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Pointing is a mouse gesture');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/timeline');
  expect(await page.locator('.band-icon').count()).toBeGreaterThanOrEqual(3);
  // Every name drawn inside a bar fits there whole.
  const cut = await page
    .locator('.bar .in')
    .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(cut).toBe(0);
  const item = page.locator('button.item').nth(4);
  const name = (await item.getAttribute('title'))!;
  await item.hover();
  await expect(page.locator('.name-line')).toContainText(name);
});

test('phones: map and timeline share the screen with a slider, down to its bottom edge', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Phone layout');
  await page.goto('/#/explore');
  const split = page.getByRole('separator', { name: 'Resize map and timeline' });
  await expect(split).toBeVisible();
  const tl = (await page.locator('.timeline-pane').boundingBox())!;
  expect(Math.abs(tl.y + tl.height - page.viewportSize()!.height)).toBeLessThan(3);
  const before = Number(await split.getAttribute('aria-valuenow'));
  await split.focus();
  await page.keyboard.press('ArrowUp');
  await expect(split).toHaveAttribute('aria-valuenow', String(before - 5));
});

test('phones: the list tab can be moved to the left edge, and the list then opens from there', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Touch gesture on phones');
  await page.goto('/#/explore');
  const tab = page.locator('.pull-tab');
  await tab.waitFor();
  const b = (await tab.boundingBox())!;
  const [x0, y0] = [b.x + b.width / 2, b.y + b.height / 2];
  await page.evaluate(
    ({ x0, y0 }) => {
      const el = document.querySelector('.pull-tab')!;
      const touch = (x: number, y: number) =>
        new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      const fire = (type: string, x: number, y: number, list = true) =>
        el.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: list ? [touch(x, y)] : [],
            changedTouches: [touch(x, y)],
          }),
        );
      fire('touchstart', x0, y0);
      // Up first (that picks the tab up), then across to the other edge.
      fire('touchmove', x0, y0 - 30);
      fire('touchmove', x0 - 150, y0 - 60);
      fire('touchmove', 20, y0 - 80);
      fire('touchend', 20, y0 - 80, false);
    },
    { x0, y0 },
  );
  await expect(page.locator('.pull-tab.left')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Events' })).toBeHidden();
  await page.locator('.pull-tab').click();
  const drawer = page.getByRole('dialog', { name: 'Events' });
  await expect(drawer).toBeVisible();
  await expect.poll(async () => (await drawer.boundingBox())!.x).toBeLessThan(1);
});

test('Clear all also turns off "Only map area"', async ({ page }) => {
  await page.goto('/#/explore?type=hackathon');
  await page.getByRole('checkbox', { name: 'Only map area' }).check();
  await page.getByLabel('Active filters').getByRole('button', { name: 'Clear all' }).click();
  await expect(page.getByRole('checkbox', { name: 'Only map area' })).not.toBeChecked();
  await expect(page.getByLabel('Active filters')).toHaveCount(0);
});

test('timeline: the wheel scrolls through the rows; Ctrl + wheel zooms', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Mouse wheel is a desktop gesture');
  await page.setViewportSize({ width: 1440, height: 450 });
  await page.goto('/#/timeline');
  const scroller = page.locator('.timeline .scroller');
  const month = page.locator('.head .cell.month').first();
  const width = (await month.boundingBox())!.width;
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await month.boundingBox())!.width).toBe(width);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -400);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await month.boundingBox())!.width).toBeGreaterThan(width);
});

test('timeline: the selected and the pointed-at event both open, with deadlines on demand', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Pointing is a mouse gesture');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  const tl = page.locator('.timeline-pane');
  // Deadlines are drawn only for opened events.
  await expect(tl.locator('button.diamond')).toHaveCount(0);
  await tl.locator('button.item[aria-label^="MIT iQuHACK"]').click();
  await expect(tl.locator('button.diamond').first()).toBeVisible();
  // Point at another event: both stay open, each on its own row with its name.
  const other = tl.locator('button.item:not([aria-label^="MIT iQuHACK"])').nth(3);
  await other.hover();
  await expect(tl.locator('.name-line')).toHaveCount(2);
  await page.waitForTimeout(400);
  await expect(tl.locator('.name-line')).toHaveCount(2);
  // A deadline names itself and, clicked, lights up the deadlines in the event's card.
  const diamond = tl.locator('button.diamond').first();
  await diamond.hover();
  await expect(diamond).toHaveAccessibleName(/Applications/);
  await diamond.click();
  await expect(page.locator('.list-pane article.card.open .dls.flash')).toBeVisible();
});

test('timeline: clicking inside a selected period removes it', async ({ page }) => {
  await page.goto('/#/timeline');
  await page
    .getByRole('button', { name: /^Select February/ })
    .first()
    .click();
  await expect(page).toHaveURL(/when=custom/);
  const band = (await page.locator('.timeline .band').first().boundingBox())!;
  const sc = (await page.locator('.timeline .scroller').boundingBox())!;
  await page.mouse.click(band.x + band.width / 2, sc.y + sc.height - 6);
  await expect(page).not.toHaveURL(/when=custom/);
  await expect(page.getByRole('button', { name: 'Clear dates ×' })).toHaveCount(0);
});

test('timeline: a band icon filters to its event type, and back', async ({ page }) => {
  await page.goto('/#/timeline');
  const icon = page.getByRole('button', { name: 'Filter: Hackathon' });
  await icon.click();
  await expect(page).toHaveURL(/type=hackathon/);
  await expect(page.locator('.band-icon')).toHaveCount(1);
  await page.getByRole('button', { name: 'Filter: Hackathon' }).click();
  await expect(page).not.toHaveURL(/type=/);
  expect(await page.locator('.band-icon').count()).toBeGreaterThan(1);
});

test('desktop: arrows on the panel borders hide filters and list; tabs at the edges bring them back', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The workspace is the desktop layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/explore');
  // The list's arrow sits on the list's border (right side), not next to the filters.
  const hideList = page.getByRole('button', { name: 'Hide list' });
  expect((await hideList.boundingBox())!.x).toBeGreaterThan(720);
  await hideList.click();
  await expect(page.locator('.list-pane')).toHaveCount(0);
  const showList = page.getByRole('button', { name: /^List \(/ });
  const tab = (await showList.boundingBox())!;
  expect(tab.x + tab.width).toBeGreaterThan(1438);
  await page.getByRole('button', { name: 'Hide filters' }).click();
  await expect(page.getByRole('complementary', { name: 'Filters' })).toBeHidden();
  await page.getByRole('button', { name: 'Show filters' }).click();
  await expect(page.getByRole('complementary', { name: 'Filters' })).toBeVisible();
  await showList.click();
  await expect(page.locator('.list-pane')).toHaveCount(1);
});
