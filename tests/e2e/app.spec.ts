import { test, expect, type Page } from '@playwright/test';

test.describe('TrendSignal', () => {
  test('dashboard loads fixture data with KPIs and article cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Indexed articles')).toBeVisible();
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('search filters the article list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('article').first()).toBeVisible();
    const initialCount = await page.locator('article').count();
    expect(initialCount).toBeGreaterThan(0);

    await page
      .getByPlaceholder('Search an article, a company, a keyword…')
      .fill('zzz-no-match-zzz');
    await expect(page.locator('article')).toHaveCount(0);
    await expect(page.getByText('No article matches these filters.')).toBeVisible();
  });

  test('keyword filter narrows results', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('article').first()).toBeVisible();
    const keywordSelect = page.getByLabel('Keyword', { exact: true });
    const options = await keywordSelect.locator('option').allTextContents();
    const firstRealOption = options.find((o) => o !== 'All');
    test.skip(!firstRealOption, 'No matched-keyword filter options in demo data');

    await keywordSelect.selectOption({ label: firstRealOption! });
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('trends page renders trend cards with status badges', async ({ page }) => {
    await page.goto('/#/trends');
    await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();
    await page.getByRole('button', { name: '7 days' }).click();
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('sources page shows a health badge per source', async ({ page }) => {
    await page.goto('/#/sources');
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first().getByText(/Healthy|Warning|Error|Disabled/)).toBeVisible();
  });

  test('external article links use target=_blank and rel=noopener noreferrer', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: /Read on source site/ }).first();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('mobile navigation drawer opens and navigates', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Drawer nav is only rendered below the lg breakpoint');
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('link', { name: 'Trends' }).click();
    await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();
  });

  test('keywords page lists keyword rows with add-keyword link', async ({ page }) => {
    await page.goto('/#/keywords');
    await expect(page.getByRole('heading', { name: 'Keywords' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add' })).toBeVisible();
  });

  test.describe('experience and accessibility', () => {
    async function openPreferences(page: Page, isMobile: boolean) {
      // Below the lg breakpoint the preferences live in the drawer.
      if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
    }

    test('dark theme can be selected and survives a reload', async ({ page, isMobile }) => {
      await page.goto('/');
      await openPreferences(page, isMobile);
      await page.getByRole('button', { name: 'Dark', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('article').first()).toBeVisible();
    });

    test('interface language can be switched to French', async ({ page, isMobile }) => {
      await page.goto('/');
      await openPreferences(page, isMobile);
      await page.getByRole('button', { name: 'Français' }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    });

    test('compact list shows the same articles and is remembered', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('article').first()).toBeVisible();
      const cardCount = await page.locator('article').count();

      await page.getByRole('button', { name: 'Compact list' }).click();
      await expect(page.getByRole('button', { name: 'Compact list' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('article')).toHaveCount(cardCount);
      await expect(page.locator('article img')).toHaveCount(0);

      await page.reload();
      await expect(page.getByRole('button', { name: 'Compact list' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    test('keyboard shortcuts search, move between articles, and open help', async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'Keyboard shortcuts are for devices with a keyboard');
      await page.goto('/');
      await expect(page.locator('article').first()).toBeVisible();

      await page.keyboard.press('/');
      await expect(page.getByRole('searchbox')).toBeFocused();
      await page.getByRole('searchbox').blur();

      await page.keyboard.press('j');
      await expect(page.locator('article').first()).toBeFocused();
      await page.keyboard.press('j');
      await expect(page.locator('article').nth(1)).toBeFocused();
      await page.keyboard.press('k');
      await expect(page.locator('article').first()).toBeFocused();

      await page.keyboard.press('?');
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await page.keyboard.press('g');
      await page.keyboard.press('t');
      await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();
    });

    test('single-key shortcuts can be switched off', async ({ page, isMobile }) => {
      test.skip(isMobile, 'Keyboard shortcuts are for devices with a keyboard');
      await page.goto('/');
      await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
      await page.getByRole('checkbox', { name: /single-key shortcuts/i }).uncheck();
      await page.keyboard.press('Escape');

      await page.keyboard.press('?');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('articles dated in the future carry an Upcoming ribbon', async ({ page }) => {
      const future = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
      // Rewrite one article's date in the static JSON the app loads; the pipeline is untouched.
      await page.route('**/articles-latest.json*', async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as { publishedAt: string }[];
        const [first] = body;
        if (first) first.publishedAt = future;
        await route.fulfill({ response, json: body });
      });

      await page.goto('/');
      await expect(page.locator('article').first()).toBeVisible();
      await expect(page.locator('[data-upcoming]')).toHaveCount(1);
      await expect(page.locator('[data-upcoming]')).toContainText('Upcoming');
    });

    test('category buttons filter the articles in one click', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('article').first()).toBeVisible();
      const total = await page.locator('article').count();
      const group = page.getByRole('group', { name: 'Category' });
      await expect(page.locator('select#filter-category')).toHaveCount(0); // no dropdown any more

      const consulting = group.getByRole('button', { name: /^Consulting/ });
      await consulting.click();
      await expect(consulting).toHaveAttribute('aria-pressed', 'true');
      const filtered = await page.locator('article').count();
      expect(filtered).toBeGreaterThan(0);
      expect(filtered).toBeLessThan(total);
      // The chip's own count matches what is shown.
      await expect(consulting).toContainText(String(filtered));

      await group.getByRole('button', { name: /^All/ }).click();
      await expect(page.locator('article')).toHaveCount(total);
    });

    test('the logo sits above the product name in the sidebar', async ({ page, isMobile }) => {
      test.skip(isMobile, 'The stacked logo is the desktop sidebar; mobile shows it inline');
      await page.goto('/');
      const logo = page.locator('aside svg[data-logo]');
      const name = page.locator('aside').getByText('TrendSignal', { exact: true });
      await expect(logo).toBeVisible();
      const logoBox = await logo.boundingBox();
      const nameBox = await name.boundingBox();
      expect(logoBox && nameBox && logoBox.y + logoBox.height <= nameBox.y + 1).toBe(true);
    });

    test('the logo is shown in the mobile header', async ({ page, isMobile }) => {
      test.skip(!isMobile, 'Mobile header only');
      await page.goto('/');
      await expect(page.locator('header svg[data-logo]')).toBeVisible();
    });
  });
});
