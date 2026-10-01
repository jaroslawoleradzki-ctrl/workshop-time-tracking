import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('np. admin').fill('docs-admin');
  await page.getByPlaceholder('••••••••').fill('documentation-only-password');
  await page.getByRole('button', { name: /zaloguj się/i }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
}

for (const theme of ['light', 'dark']) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 600 }, { width: 1920, height: 1080 }, { width: 834, height: 600 }, { width: 834, height: 420 }]) {
    test(`v0.6.1 Help scrolls to the end: ${theme} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await login(page);
      await page.evaluate((value) => { localStorage.setItem('theme', value); }, theme);
      await page.goto('/#help/rejestracja-czasu');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.help-figure img').first()).toBeVisible();
      await page.locator('.help-figure img').evaluateAll(async (images) => {
        await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
      });
      const wrapper = page.locator('.content-wrapper');
      expect(await wrapper.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
      const headerBefore = await page.locator('.navbar').boundingBox();
      const sidebarBefore = await page.locator('.sidebar').evaluate((element) => element.scrollTop);
      await wrapper.hover();
      await page.mouse.wheel(0, 500);
      await expect.poll(() => wrapper.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await wrapper.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(page.getByRole('button', { name: 'Następny', exact: true })).toBeInViewport();
      const metrics = await wrapper.evaluate((element) => ({ top: element.scrollTop, height: element.clientHeight, scrollHeight: element.scrollHeight }));
      expect(Math.abs(metrics.top + metrics.height - metrics.scrollHeight)).toBeLessThanOrEqual(1);
      expect(await page.locator('.sidebar').evaluate((element) => element.scrollTop)).toBe(sidebarBefore);
      expect(await page.locator('.navbar').boundingBox()).toEqual(headerBefore);
      await page.screenshot({ path: `/tmp/v061-help-${theme}-${viewport.width}x${viewport.height}.png` });
    });
  }
}

test('v0.6.1 real API: legacy NN preserves absence detail and reconciliation; employee total stays readable', async ({ page }) => {
  await login(page);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const headers = { Authorization: `Bearer ${token}` };
  const range = 'dateFrom=2026-07-01&dateTo=2026-07-31';
  // Recover records left by an interrupted run in this dedicated *_docs database.
  const previousReports = await (await page.request.get('/api/analytics/report-detailed?dateFrom=2026-07-13&dateTo=2026-07-13', { headers })).json();
  for (const previous of previousReports as Array<{ id: string; workTimeTypeCode: string }>) {
    if (previous.workTimeTypeCode === 'NN') {
      expect((await page.request.delete(`/api/reports/${previous.id}`, { headers })).ok()).toBeTruthy();
    }
  }
  const baselineResponse = await page.request.get(`/api/analytics/closure-control-summary?${range}`, { headers });
  expect(baselineResponse.ok()).toBeTruthy();
  const baseline = await baselineResponse.json();
  const types = await (await page.request.get('/api/work-time-types', { headers })).json();
  const createdType = types.some((type: { code: string }) => type.code === 'NN')
    ? await page.request.put('/api/work-time-types/NN', { headers, data: { name: 'Nieobecność nieusprawiedliwiona', requiresOrder: false, isAbsence: false } })
    : await page.request.post('/api/work-time-types', { headers, data: { code: 'NN', name: 'Nieobecność nieusprawiedliwiona', requiresOrder: false, isAbsence: false } });
  expect(createdType.ok()).toBeTruthy();
  const created = await page.request.post('/api/reports', { headers, data: { employeeId: '00000000-0000-4000-8000-000000000001', date: '2026-07-13', hours: 8, workTimeTypeCode: 'NN', workShift: 'FIRST', orderId: '00000000-0000-4000-8000-000000000201' } });
  expect(created.ok()).toBeTruthy();
  const { report: record } = await created.json();
  try {
    const response = await page.request.get(`/api/analytics/report-by-employee?${range}`, { headers });
    const rows = await response.json();
    const worked = rows.reduce((sum: number, row: { suma: number }) => sum + row.suma, 0);
    expect(rows.find((row: { workShift: string }) => row.workShift === 'ABSENCE')).toMatchObject({ NN: 8, suma: 0, sumaBezNadgodzin: 0 });
    const control = await (await page.request.get(`/api/analytics/closure-control-summary?${range}`, { headers })).json();
    expect(control).toMatchObject({ ordersHours: baseline.ordersHours, totalEmployeeHours: baseline.totalEmployeeHours, totalSettledHours: baseline.totalSettledHours, difference: 0, status: 'MATCHED' });
    expect(control.absences.find((row: { code: string }) => row.code === 'NN')).toMatchObject({ hours: 8 });
    const periods = await (await page.request.get(`/api/analytics/report-absence-periods?${range}&workTimeTypeCode=NN`, { headers })).json();
    expect(periods).toHaveLength(1);
    await page.locator('.sidebar').getByRole('button', { name: 'Raporty', exact: true }).click();
    await page.getByRole('button', { name: 'Wg Pracowników (Miesięczny)' }).click();
    await page.locator('#report-date-from').fill('2026-07-01');
    await page.locator('#report-date-to').fill('2026-07-31');
    await page.getByRole('button', { name: 'Odśwież dane' }).click();
    await expect(page.getByRole('columnheader', { name: 'Łącznie przepracowane w okresie' })).toBeVisible();
    const total = page.locator('td[rowspan]');
    await expect(total).toHaveCount(1);
    await expect(total).toHaveText(`${worked.toFixed(1)} h`);
    for (const shift of ['I', 'II', 'III']) await expect(page.getByRole('cell', { name: shift, exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/v061-employee-report.png' });
  } finally {
    const removed = await page.request.delete(`/api/reports/${record.id}`, { headers });
    expect(removed.ok()).toBeTruthy();
  }
});
