import { prepareEnvironment } from './prepare';
import { captureScreenshots } from './capture-screenshots';
import { renderDiagrams } from './diagrams';
import { validateDocumentation } from './validate';
import { buildDocuments } from './build-docs';
import { buildReleaseNotes } from './build-release-notes';
import { generateReport } from './build-report';
import { cleanupEnvironment } from './cleanup';

async function main() {
  console.log('🚀 Uruchamianie pełnego pipeline generowania dokumentacji WARSZTAT (npm run docs)...');

  try {
    // Step 1: Prepare environment (Docker, Prisma DB push, seed-doc, start backend/frontend)
    await prepareEnvironment();

    // Step 2: Capture Playwright screenshots
    await captureScreenshots();

    // Step 3: Render Mermaid diagrams to PNG
    await renderDiagrams();

    // Step 4: Validate components, drift & Privacy Audit
    await validateDocumentation();

    // Step 5: Build DOCX & PDF documents from Markdown AST
    await buildDocuments();

    // Step 6: Build Release Notes from CHANGELOG.md
    await buildReleaseNotes();

    // Step 7: Build documentation report and manifest.json with checksums
    await generateReport();

    console.log('\n🎉 PEŁNY PIPELINE DOKUMENTACJI ZAKOŃCZONY SUKCESEM!');
  } catch (error) {
    console.error('\n❌ PIPELINE DOKUMENTACJI ZAKOŃCZONY BŁĘDEM:', error);
    process.exitCode = 1;
  } finally {
    console.log('\n🧹 Sprzątanie środowiska (Cleanup)...');
    await cleanupEnvironment();
  }
}

main();
