import { test, expect } from '@playwright/test';
import path from 'node:path';
import { screenshotManifest } from './manifest';
import { prepareStablePage } from './fixtures';
for (const entry of screenshotManifest) test(`captures ${entry.id}`, async ({ page, baseURL }) => { await page.setViewportSize(entry.viewport); await page.goto(baseURL!, { waitUntil: 'networkidle' }); await prepareStablePage(page); await page.reload({ waitUntil: 'networkidle' }); await expect(page.getByRole('heading', { name: 'WARSZTAT' })).toBeVisible(); await expect(page.getByRole('button', { name: /zaloguj się/i })).toBeVisible(); await page.screenshot({ path: path.resolve(import.meta.dirname, `../public/help/${entry.targetFile}`), fullPage: true }); });

test('opens Help and renders the generated login screenshot for the docs administrator', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseURL!, { waitUntil: 'networkidle' });
  await prepareStablePage(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByPlaceholder('np. admin').fill('docs-admin');
  await page.getByPlaceholder('••••••••').fill('documentation-only-password');
  await page.getByRole('button', { name: /zaloguj się/i }).click();
  const helpNavigation = page.getByRole('navigation').getByRole('button', { name: 'Pomoc / Instrukcja' });
  await expect(helpNavigation).toBeVisible();
  await helpNavigation.click();
  await page.getByRole('button', { name: 'Logowanie', exact: true }).click();
  const screenshot = page.getByAltText('Ekran logowania systemu Warsztat');
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute('src', '/help/logowanie-01-ekran-logowania.png');
  await expect(screenshot).toHaveJSProperty('complete', true);
  expect(await screenshot.evaluate((image: HTMLImageElement) => image.naturalWidth > 0)).toBe(true);
});
