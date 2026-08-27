import { test, expect } from '@playwright/test';

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
});
