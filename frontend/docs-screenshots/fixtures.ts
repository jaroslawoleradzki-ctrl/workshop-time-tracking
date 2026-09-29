import type { Page } from '@playwright/test';
export async function prepareStablePage(page: Page): Promise<void> { await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' }); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); }
