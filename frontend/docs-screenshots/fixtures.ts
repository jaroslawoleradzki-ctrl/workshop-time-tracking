import type { Page } from '@playwright/test';
export async function prepareStablePage(page: Page): Promise<void> {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
}

export async function disablePageMotion(page: Page): Promise<void> {
  const style = await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  await style.evaluate((element) => element.setAttribute('data-docs-stability', 'true'));
}
