import { expect, test } from '@playwright/test';

test('Data combines the three sections and keeps their controls working', async ({ page }) => {
  await page.goto('./#data');
  const nav = page.getByRole('navigation', { name: 'Sections', exact: true });
  await expect(nav.getByRole('link', { name: 'Data', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link')).toHaveCount(4);
  for (const name of ['Season', 'Deviations', 'Beds']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('radio', { name: 'Winter', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Winter', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('navigation', { name: 'Data sections' }).getByRole('link', { name: 'Beds', exact: true }).click();
  await expect(page).toHaveURL(/#capacity$/);
  await expect(page.getByRole('grid', { name: /Share of beds booked/ })).toBeVisible();
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Previous month', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

for (const hash of ['season', 'why', 'capacity']) {
  test(`legacy #${hash} opens its section inside Data`, async ({ page }) => {
    await page.goto(`./#${hash}`);
    await expect(page.getByRole('heading', { name: 'Data', exact: true })).toBeVisible();
    await expect(page.locator(`#${hash}`)).toBeVisible();
  });
}
