import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { verifyDocumentationEnvironment, ROOT_DIR, IMAGES_DIR, SCHEMA_DIR } from './config';

export async function captureScreenshots() {
  console.log('📸 [docs:screenshots] Wykonywanie deterministycznych zrzutów ekranu...');

  process.env.DOCS_MODE = 'true';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://time_user:secure_db_password@localhost:5432/time_reporting_docs?schema=public';
  verifyDocumentationEnvironment();

  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const matrixPath = path.join(SCHEMA_DIR, 'screenshot-matrix.json');
  const scenarios = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

  const browser = await chromium.launch({
    headless: true,
    env: {
      ...process.env,
      TZ: 'Europe/Warsaw',
      LANG: 'pl_PL.UTF-8',
    },
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    deviceScaleFactor: 2,
  });

  const baseUrl = 'http://localhost:5173';

  // Helper to add animation disabling stylesheet
  const setupPage = async () => {
    const p = await context.newPage();
    await p.addInitScript(() => {
      const style = document.createElement('style');
      style.innerHTML = `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }
      `;
      document.head?.appendChild(style);
    });
    return p;
  };

  // 1. Capture Login Form Scenarios
  console.log('  -> Przechodzenie na stronę logowania...');
  const guestPage = await setupPage();
  await guestPage.goto(baseUrl);
  await guestPage.waitForSelector('[data-testid="login-container"]', { state: 'visible' });

  for (const item of scenarios) {
    if (!item.capture) continue;

    if (item.id === 'login-form') {
      console.log(`  -> Wykonywanie screenshotu: ${item.filename}`);
      const element = guestPage.locator(item.targetSelector);
      await element.waitFor({ state: 'visible' });
      await guestPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
    }

    if (item.id === 'login-validation-error') {
      console.log(`  -> Wykonywanie screenshotu walidacji błędu logowania: ${item.filename}`);
      await guestPage.fill('[data-testid="login-username"]', 'admin');
      await guestPage.fill('[data-testid="login-password"]', 'wrongpass');
      await guestPage.click('[data-testid="login-submit"]');
      await guestPage.waitForSelector('[data-testid="login-alert-error"]', { state: 'visible' });
      await guestPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
    }
  }

  await guestPage.close();

  // 2. Perform Admin Session on a fresh page
  console.log('  -> Logowanie jako Administrator (admin)...');
  const adminPage = await setupPage();
  await adminPage.goto(baseUrl);
  await adminPage.waitForSelector('[data-testid="login-container"]', { state: 'visible' });
  await adminPage.fill('[data-testid="login-username"]', 'admin');
  await adminPage.fill('[data-testid="login-password"]', 'admin123');
  await adminPage.click('[data-testid="login-submit"]');
  await adminPage.waitForSelector('.navbar', { state: 'visible' });

  // 3. Capture Authenticated Admin Views
  for (const item of scenarios) {
    if (!item.capture) continue;

    if (item.id === 'dashboard-overview') {
      console.log(`  -> Przejście do Dashboard i wykonywanie screenshotu: ${item.filename}`);
      await adminPage.click('aside.sidebar button:has-text("Dashboard")');
      await adminPage.waitForSelector(item.targetSelector, { state: 'visible' });
      await adminPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
    }

    if (item.id === 'reporting-panel') {
      console.log(`  -> Przejście do panelu Raportowanie...`);
      await adminPage.click('aside.sidebar button:has-text("Raportowanie")');
      await adminPage.waitForSelector(item.targetSelector, { state: 'visible' });
      await adminPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
    }

    if (item.id === 'reporting-missing-card') {
      console.log(`  -> Wykonywanie screenshotu widoku z brakiem karty...`);
      await adminPage.waitForSelector(item.targetSelector, { state: 'visible' });
      await adminPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
    }

    if (item.id === 'absence-modal') {
      console.log(`  -> Otwieranie modala dodawania nieobecności zakresem...`);
      const absenceBtn = adminPage.locator('button:has-text("Dodaj nieobecność")');
      if (await absenceBtn.isVisible()) {
        await absenceBtn.click();
        await adminPage.waitForSelector(item.targetSelector, { state: 'visible' });
        await adminPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
        
        // Close modal cleanly via close button or click overlay
        const closeBtn = adminPage.locator('[data-testid="absence-modal"] button').first();
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        } else {
          await adminPage.click('[data-testid="absence-modal"]', { position: { x: 10, y: 10 } });
        }
        await adminPage.waitForSelector('[data-testid="absence-modal"]', { state: 'hidden' });
      }
    }

    if (item.id === 'orders-table') {
      console.log(`  -> Przejście do Bazy Zleceń...`);
      await adminPage.click('aside.sidebar button:has-text("Zlecenia")');
      await adminPage.waitForSelector(item.targetSelector, { state: 'visible' });
      await adminPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
    }

    if (item.id === 'orders-export-success') {
      console.log(`  -> Wykonywanie zrzutu widoku Bazy Zleceń...`);
      await adminPage.waitForSelector(item.targetSelector, { state: 'visible' });
      await adminPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
    }

    if (item.id === 'admin-users-table') {
      console.log(`  -> Przejście do Administracji -> Użytkownicy...`);
      const adminNavBtn = adminPage.locator('aside.sidebar button:has-text("Administracja")');
      if (await adminNavBtn.isVisible()) {
        await adminNavBtn.click();
        await adminPage.waitForTimeout(300); // Allow submenu transition
      }
      await adminPage.click('aside.sidebar button:has-text("Użytkownicy")');
      await adminPage.waitForSelector(item.targetSelector, { state: 'visible' });
      await adminPage.screenshot({ path: path.join(IMAGES_DIR, item.filename) });
    }
  }

  await adminPage.close();
  await browser.close();
  console.log('✅ Wszystkie screenshoty wykonane i zapisane w docs/images/!');
}

if (require.main === module) {
  captureScreenshots().catch((err) => {
    console.error('❌ Błąd podczas wykonywania screenshotów:', err);
    process.exit(1);
  });
}
