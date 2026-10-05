import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { screenshotManifest, type DocsScreenshot } from './manifest';
import { disablePageMotion, prepareStablePage } from './fixtures';

async function logIn(page: Page, role: 'admin' | 'leader') {
  await page.getByPlaceholder('np. admin').fill(role === 'admin' ? 'docs-admin' : 'docs-leader');
  await page.getByPlaceholder('••••••••').fill('documentation-only-password');
  await page.getByRole('button', { name: /zaloguj się/i }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
}

async function openTab(page: Page, tab: DocsScreenshot['tab']) {
  if (tab === 'login') return;
  const sidebar = page.locator('.sidebar');
  const mainLabels: Partial<Record<DocsScreenshot['tab'], string>> = {
    dashboard: 'Dashboard', reporting: 'Raportowanie', reports: 'Raporty', orders: 'Zlecenia',
  };
  if (mainLabels[tab]) {
    await sidebar.getByRole('button', { name: mainLabels[tab], exact: true }).click();
  } else {
    const administration = sidebar.getByRole('button', { name: 'Administracja', exact: true });
    const submenu = sidebar.getByRole('button', { name: tab === 'calendar' ? 'Kalendarz zakładowy' : tab === 'imports' ? 'Import danych' : 'Słowniki' });
    if (!(await submenu.isVisible())) await administration.click();
    await submenu.click();
  }
}

async function fillReporting(page: Page, entry: DocsScreenshot) {
  const dayResponse = entry.id === 'copied-day-shifts'
    ? page.waitForResponse((response) => response.url().includes('/api/reports/by-employee-date') && response.url().includes('date=2026-07-08'))
    : null;
  await page.locator('#dateInput').fill('2026-07-08');
  const existingDay = dayResponse ? await (await dayResponse).json() as unknown[] : null;
  await expect(page.getByPlaceholder('Wyszukaj pracownika...')).toBeVisible();
  await page.waitForLoadState('networkidle');
  if (entry.id === 'absence-range') {
    await page.getByRole('button', { name: 'Dodaj nieobecność' }).click();
    const modal = page.locator('.modal-content');
    await modal.locator('input[type="date"]').nth(0).fill('2026-07-14');
    await modal.locator('input[type="date"]').nth(1).fill('2026-07-16');
    await expect(modal.getByText('Podsumowanie zakresu:')).toBeVisible();
    await modal.getByText('Podsumowanie zakresu:').click();
    return;
  }
  if (entry.id === 'copied-day-shifts') {
    if (existingDay?.length === 0) await page.getByRole('button', { name: 'Kopiuj ostatni dzień' }).click();
    await expect(page.getByText('III zmiana')).toBeVisible();
    await expect(page.locator('.alert-danger')).toHaveCount(0);
    await expect(page.getByText(/Skopiowano 3 wpisów/)).toHaveCount(0, { timeout: 10_000 });
    await page.getByRole('heading', { name: 'Raportowanie Godzin Pracy' }).click();
    return;
  }
  if (entry.id === 'absence-shift-disabled') {
    await page.locator('#workTypeSelect').selectOption('WKU');
    await expect(page.locator('#workShiftSelect')).toHaveCount(0);
    return;
  }
  await page.locator('#workTypeSelect').selectOption('G');
  await page.getByPlaceholder('Wpisz numer zlecenia lub produktu...').fill('DOC-2026-001');
  await page.getByText('Zlecenie: DOC-2026-001').click();
  await page.getByPlaceholder('np. 8.00').fill(entry.id === 'hours-warning' ? '9' : '2');
  if (entry.id === 'hours-warning') {
    await page.getByRole('button', { name: /Zapisz wpis/ }).click();
    await expect(page.getByRole('button', { name: 'Ignoruj i zapisz' })).toBeVisible();
  }
}

async function fillReport(page: Page, entry: DocsScreenshot) {
  if (['hr-overview', 'hr-tablet'].includes(entry.id)) {
    await page.getByRole('button', { name: 'Wg Pracowników (Miesięczny)' }).click();
  } else if (entry.id === 'absence-periods') {
    await page.getByRole('button', { name: 'Okresy Nieobecności' }).click();
  }
  await page.locator('#report-date-from').fill('2026-07-01');
  await page.locator('#report-date-to').fill('2026-07-31');
  if (entry.id === 'closure-control') await page.getByRole('button', { name: 'Raport zamknięcia' }).click();
  await page.getByRole('button', { name: 'Odśwież dane' }).click();
  await expect(page.getByRole('button', { name: 'Pobierz Excel (XLSX)' })).toBeEnabled();
  if (['hr-overview', 'hr-tablet'].includes(entry.id)) {
    await expect(page.getByRole('columnheader', { name: 'Suma godzin bez nadgodzin' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Zmiana' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Łącznie przepracowane w okresie' })).toHaveCount(0);
    await expect(page.getByRole('table', { name: 'Raport według pracowników' }).locator('tbody tr')).toHaveCount(1);
  }
  if (entry.id === 'closure-control') await expect(page.getByText('Kontrola rozliczenia czasu')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });
for (const entry of screenshotManifest) {
  test(`captures ${entry.id}`, async ({ page, baseURL }) => {
    await page.setViewportSize(entry.viewport);
    await page.goto(baseURL!, { waitUntil: 'networkidle' });
    await prepareStablePage(page);
    await page.reload({ waitUntil: 'networkidle' });
    if (entry.role !== 'anonymous') {
      await logIn(page, entry.role);
      await openTab(page, entry.tab);
      if (entry.id === 'nav-admin') {
        await page.locator('.sidebar').getByRole('button', { name: 'Administracja', exact: true }).click();
        await expect(page.locator('.sidebar').getByRole('button', { name: 'Słowniki' })).toBeVisible();
      }
      if (entry.tab === 'reporting' && !['nav-leader'].includes(entry.id)) await fillReporting(page, entry);
      if (entry.tab === 'reports') await fillReport(page, entry);
      if (entry.tab === 'orders') {
        await page.getByPlaceholder('Szukaj zlecenia po numerze, produkcie, koncie księgowym...').fill('DOC');
        await page.getByRole('combobox', { name: 'Filtr statusu' }).selectOption('OPEN');
        await expect(page.getByText('DOC-2026-001').first()).toBeVisible();
      }
      if (entry.tab === 'calendar') {
        await page.locator('#calendar-from').fill('2026-07-07');
        await page.locator('#calendar-to').fill('2026-07-13');
        await page.getByRole('button', { name: 'Pokaż zakres' }).click();
        await expect(page.getByText('Przykładowa sobota robocza')).toBeVisible();
        await page.getByRole('button', { name: /2026-07-11/ }).click();
      }
      if (entry.tab === 'imports') await expect(page.getByText('przyklad-pracownicy.xlsx')).toBeVisible();
      if (entry.tab === 'dictionaries') await expect(page.getByText('WKU').first()).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'WARSZTAT' })).toBeVisible();
    }
    await disablePageMotion(page);
    await expect(page.locator('style[data-docs-stability]')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    const target = path.resolve(import.meta.dirname, `../public/help/${entry.targetFile}`);
    await page.screenshot({ path: target, fullPage: true, animations: 'disabled', caret: 'hide' });
  });
}

test('renders every generated screenshot inside Help at desktop and tablet widths', async ({ page, baseURL }) => {
  await page.goto(baseURL!, { waitUntil: 'networkidle' });
  await prepareStablePage(page);
  await page.reload({ waitUntil: 'networkidle' });
  await logIn(page, 'admin');
  for (const width of [1440, 834]) {
    await page.setViewportSize({ width, height: width === 834 ? 1112 : 900 });
    for (const entry of screenshotManifest) {
      await page.goto(`${baseURL}/#help/${entry.chapter}`, { waitUntil: 'networkidle' });
      const image = page.locator(`img[src="/help/${entry.targetFile}"]`);
      await expect(image).toBeVisible();
      await expect(image).toHaveJSProperty('complete', true);
      expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    }
    if (width === 834) {
      const drawer = page.locator('.help-chapter-drawer');
      await expect(drawer.locator('summary')).toBeVisible();
      await drawer.locator('summary').click();
      await expect(drawer).not.toHaveAttribute('open');
      await drawer.locator('summary').click();
      await expect(drawer).toHaveAttribute('open');
      await expect(drawer.getByRole('button', { name: 'Pierwsze kroki' })).toBeVisible();
    }
  }
  await page.locator('.sidebar').getByRole('button', { name: 'Raporty' }).click();
  await expect(page).not.toHaveURL(/#help\//);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.sidebar .nav-item.active')).toHaveText('Raporty');
});

test('opens all five contextual Help chapters from their application screens', async ({ page, baseURL }) => {
  await page.goto(baseURL!, { waitUntil: 'networkidle' });
  await prepareStablePage(page);
  await page.reload({ waitUntil: 'networkidle' });
  await logIn(page, 'admin');
  const cases: Array<{ tab: DocsScreenshot['tab']; chapter: string; report?: 'hr' }> = [
    { tab: 'reporting', chapter: 'rejestracja-czasu' },
    { tab: 'reports', chapter: 'raport-zlecen' },
    { tab: 'reports', chapter: 'raport-hr', report: 'hr' },
    { tab: 'orders', chapter: 'baza-zlecen' },
    { tab: 'calendar', chapter: 'kalendarz' },
  ];
  for (const item of cases) {
    await openTab(page, item.tab);
    if (item.report === 'hr') await page.getByRole('button', { name: 'Wg Pracowników (Miesięczny)' }).click();
    await page.getByRole('button', { name: 'Otwórz pomoc dla tej sekcji' }).click();
    await expect(page).toHaveURL(new RegExp(`#help/${item.chapter}$`));
    await expect(page.getByRole('heading', { name: item.chapter === 'raport-hr' ? 'Raport HR (wg pracowników)' : item.chapter === 'raport-zlecen' ? 'Raport wg zleceń' : item.chapter === 'rejestracja-czasu' ? 'Rejestracja czasu pracy' : item.chapter === 'baza-zlecen' ? 'Baza zleceń' : 'Kalendarz zakładowy' })).toBeVisible();
  }
});
