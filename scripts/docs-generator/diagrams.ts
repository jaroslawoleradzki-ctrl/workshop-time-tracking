import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { ROOT_DIR, SOURCE_DIR, IMAGES_DIR } from './config';

export async function renderDiagrams() {
  console.log('📊 [docs:diagrams] Renderowanie diagramów Mermaid do plików PNG...');

  const diagramsSourceDir = path.join(SOURCE_DIR, 'diagrams');
  const diagramsTargetDir = path.join(IMAGES_DIR, 'diagrams');

  if (!fs.existsSync(diagramsSourceDir)) {
    console.log('ℹ️ Brak katalogu source/diagrams, pomijanie.');
    return;
  }

  if (!fs.existsSync(diagramsTargetDir)) {
    fs.mkdirSync(diagramsTargetDir, { recursive: true });
  }

  const mmdFiles = fs.readdirSync(diagramsSourceDir).filter((f) => f.endsWith('.mmd'));
  if (mmdFiles.length === 0) {
    console.log('ℹ️ Brak plików .mmd w katalogu diagrams.');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });

  for (const file of mmdFiles) {
    const filePath = path.join(diagramsSourceDir, file);
    const mmdContent = fs.readFileSync(filePath, 'utf8');
    const outputFilename = `${path.basename(file, '.mmd')}.png`;
    const outputPath = path.join(diagramsTargetDir, outputFilename);

    console.log(`  -> Renderowanie diagramu: ${file} -> ${outputFilename}`);

    // Create a controlled HTML page with Mermaid library loaded via CDN or inline script
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
          <style>
            body {
              margin: 0;
              padding: 20px;
              background-color: #0f172a;
              color: #f8fafc;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: inline-block;
            }
            .mermaid {
              background-color: #0f172a;
            }
          </style>
        </head>
        <body>
          <div class="mermaid">
            ${mmdContent}
          </div>
          <script>
            mermaid.initialize({
              startOnLoad: true,
              theme: 'dark',
              flowchart: { useMaxWidth: false, htmlLabels: true }
            });
          </script>
        </body>
      </html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000); // Allow mermaid to render svg

    const element = page.locator('.mermaid');
    if (await element.isVisible()) {
      await element.screenshot({ path: outputPath, omitBackground: false });
    } else {
      await page.screenshot({ path: outputPath });
    }
  }

  await browser.close();
  console.log('✅ Wszystkie diagramy Mermaid zostały wyrenderowane!');
}

if (require.main === module) {
  renderDiagrams().catch((err) => {
    console.error('❌ Błąd podczas renderowania diagramów:', err);
    process.exit(1);
  });
}
