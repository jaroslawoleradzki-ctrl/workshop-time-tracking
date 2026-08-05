import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { validateDocumentation } from './validate';
import { ROOT_DIR, RELEASES_DIR, DETERMINISTIC_TIMESTAMP } from './config';

export async function generateReport() {
  console.log('📊 [docs:report] Generowanie Raportu Kompletności oraz Pliku Manifest.json...');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const version = pkg.version || '0.4.4';
  const releaseTargetDir = path.join(RELEASES_DIR, `v${version}`);

  if (!fs.existsSync(releaseTargetDir)) {
    fs.mkdirSync(releaseTargetDir, { recursive: true });
  }

  // 1. Run validation scanner
  const validation = await validateDocumentation();

  // 2. Build documentation-report.md
  const statusIcon = validation.missingDocumentation.length === 0 && validation.privacyAuditPassed ? '✅ GOTOWE' : '⚠️ ZGŁOSZONE UWAGI';

  const reportMarkdown = `# Raport Kompletności Dokumentacji — Wersja v${version}
Data wygenerowania: 2026-08-02
Status ogólny: **${statusIcon}**

## 1. Statystyki Pokrycia Komponentów
- Wszystkie komponenty React: **${validation.componentsTotal}**
- Dokumentowane komponenty biznesowe: **${validation.documentedCount}**
- Brakujące pliki instrukcji: **${validation.missingDocumentation.length}**
- Nieklasyfikowane komponenty: **${validation.unclassifiedComponents.length}**

## 2. Status Audytu Prywatności (Privacy Audit)
- Wynik audytu: **${validation.privacyAuditPassed ? 'ZALICZONY (PASSED)' : 'NIEZALICZONY (FAILED)'}**
- Wykryte błędy / wycieki: **${validation.privacyErrors.length}**

## 3. Zgłoszone Uwagi i Brakujące Pliki
${validation.missingDocumentation.length === 0 ? '✓ Brak brakujących plików dokumentacji.' : validation.missingDocumentation.map((m) => `- ❌ ${m}`).join('\n')}

## 4. Wykryte Komponenty Nowe (Nieklasyfikowane)
${validation.unclassifiedComponents.length === 0 ? '✓ Wszystkie komponenty React są sklasyfikowane w registry.json.' : validation.unclassifiedComponents.map((u) => `- ⚠️ ${u}`).join('\n')}

## 5. Wykryty Rozdźwięk Wersji (Version Drift)
${validation.outdatedDocuments.length === 0 ? '✓ Wszystkie pliki Markdown są zaktualizowane do najnowszej wersji v' + version + '.' : validation.outdatedDocuments.map((o) => `- ⚠️ Wymagana aktualizacja: ${o}`).join('\n')}
`;

  const reportPath = path.join(releaseTargetDir, 'documentation-report.md');
  fs.writeFileSync(reportPath, reportMarkdown, 'utf8');

  // 3. Build manifest.json with checksums
  let commitHash = 'unknown';
  try {
    commitHash = execSync('git rev-parse HEAD', { cwd: ROOT_DIR }).toString().trim();
  } catch (e) {}

  const manifestFiles: any[] = [];
  function collectReleaseFiles(dir: string, baseDir: string) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (f === 'manifest.json') continue;
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        collectReleaseFiles(full, baseDir);
      } else {
        const relPath = path.relative(baseDir, full);
        const fileBuffer = fs.readFileSync(full);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        manifestFiles.push({
          path: relPath,
          sizeBytes: fileBuffer.length,
          sha256: hash,
        });
      }
    }
  }

  collectReleaseFiles(releaseTargetDir, releaseTargetDir);

  const manifest = {
    appVersion: version,
    generatorVersion: '1.0.0',
    generatedAt: DETERMINISTIC_TIMESTAMP,
    commitHash: commitHash,
    seedUsed: 'seed-doc',
    privacyAuditResult: validation.privacyAuditPassed ? 'PASSED' : 'FAILED',
    files: manifestFiles,
  };

  const manifestPath = path.join(releaseTargetDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`✅ Plik documentation-report.md i manifest.json zapisane w docs/releases/v${version}/!`);
}

if (require.main === module) {
  generateReport().catch((err) => {
    console.error('❌ Błąd podczas generowania raportu:', err);
    process.exit(1);
  });
}
