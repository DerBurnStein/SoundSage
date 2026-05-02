import { test, expect } from '@playwright/test';

const base = process.env.E2E_BASE_URL || 'http://localhost:3000';

for (const path of ['/', '/history', '/patterns', '/tracks', '/artists']) {
  test(`tab route renders: ${path}`, async ({ page }) => {
    await page.goto(`${base}${path}?range=4w`);
    await expect(page.locator('body')).toBeVisible();
  });
}

test('time-range query persists in URL', async ({ page }) => {
  await page.goto(`${base}/?range=6m`);
  await expect(page).toHaveURL(/range=6m/);
});
