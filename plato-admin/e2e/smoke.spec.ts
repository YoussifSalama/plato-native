import { expect, test, type Page } from '@playwright/test';
import { fixtures, USER_ID } from './fixtures';

// Every page opens, shows its title, raises no error in the browser and has no sideways scroll,
// on a laptop and on a phone. The API is mocked (fixtures.ts).
const PAGES: [path: string, heading: RegExp][] = [
  ['/', /Dashboard/],
  ['/usage', /Usage & cost/],
  ['/usage/apify', /Usage & cost/],
  ['/usage/searches', /Usage & cost/],
  ['/plans', /Plans/],
  ['/credits', /Credits/],
  ['/users', /Users/],
  [`/users/${USER_ID}`, /Mona Test/],
  ['/users/rate-limits', /Rate limits/],
  ['/logs', /Logs/],
  ['/logs?view=all', /Logs/],
  ['/logs/extension', /Logs/],
  ['/logs/extension?view=users', /Logs/],
  [`/logs/extension/${USER_ID}`, /Logs/],
  ['/team', /Team/],
  ['/team?tab=roles', /Team/],
  ['/team?tab=audit', /Team/],
  ['/nope', /Page not found/],
];

async function mockApi(page: Page) {
  await page.route('**/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    // the SPA's own routes are not the API (only the API is under /admin)
    if (route.request().resourceType() === 'document') return route.continue();
    const hit = fixtures.find(([re]) => re.test(path));
    await route.fulfill({ json: hit ? hit[1] : { items: [], total: 0 } });
  });
}

for (const [path, heading] of PAGES) {
  test(`opens ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await mockApi(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(heading);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll).toBeLessThanOrEqual(width);
  });
}

test('Ctrl+K finds a seeker and opens their page', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard shortcut');
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(/Dashboard/);
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill('mona');
  await expect(page.getByRole('option', { name: /mona@example.com/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/users/${USER_ID}`));
});
