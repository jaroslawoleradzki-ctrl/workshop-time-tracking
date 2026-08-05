import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { ROOT_DIR, SOURCE_DIR, SCHEMA_DIR } from './config';

export interface ValidationReport {
  componentsTotal: number;
  documentedCount: number;
  missingDocumentation: string[];
  unclassifiedComponents: string[];
  privacyAuditPassed: boolean;
  privacyErrors: string[];
  outdatedDocuments: string[];
}

export async function validateDocumentation(): Promise<ValidationReport> {
  console.log('🔍 [docs:validate] Skanowanie komponentów, weryfikacja braków i Audyt Prywatności...');

  const report: ValidationReport = {
    componentsTotal: 0,
    documentedCount: 0,
    missingDocumentation: [],
    unclassifiedComponents: [],
    privacyAuditPassed: true,
    privacyErrors: [],
    outdatedDocuments: [],
  };

  // 1. Read registry.json
  const registryPath = path.join(SCHEMA_DIR, 'registry.json');
  const registry: any[] = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  // 2. Scan frontend/src/components/
  const componentsDir = path.join(ROOT_DIR, 'frontend/src/components');
  const componentFiles = fs.readdirSync(componentsDir).filter((f) => f.endsWith('.tsx'));
  report.componentsTotal = componentFiles.length + 1; // +1 for App.tsx login modal

  const registryComponentMap = new Set(registry.map((r) => r.component.split(' ')[0]));

  for (const file of componentFiles) {
    if (!registryComponentMap.has(file)) {
      report.unclassifiedComponents.push(file);
      console.warn(`  ⚠️ Ostrzeżenie: Wykryto nowy komponent React nieklasyfikowany w registry.json: ${file}`);
    }
  }

  // Check documented components vs existing markdown files
  for (const entry of registry) {
    if (entry.type === 'technical') continue;

    if (entry.required) {
      const docPath = path.join(ROOT_DIR, entry.documentationPath);
      if (!fs.existsSync(docPath)) {
        report.missingDocumentation.push(`${entry.id} (${entry.component}) -> Brak pliku ${entry.documentationPath}`);
      } else {
        report.documentedCount++;
      }
    }
  }

  // 3. Privacy Audit (No real production emails, tokens, secrets, forbidden client data)
  console.log('  🔒 Przeprowadzanie Audytu Prywatności (Privacy Audit)...');
  const forbiddenPatterns = [
    /@[a-zA-Z0-9-]+\.(pl|com|org|net)(?<!example\.com|test\.com|pv\.pl)/i, // Real email domains
    /postgres:\/\/.*:.*@production/i,
    /AKIA[0-9A-Z]{16}/, // AWS Key pattern
    /ghp_[a-zA-Z0-9]{36}/, // GitHub token pattern
  ];

  const allowedSyntheticNames = new Set([
    'Nowak Piotr',
    'Kowalski Jan',
    'Wiśniewski Adam',
    'Wójcik Mariusz',
    'Kowalczyk Robert',
    'MetalWorks Sp. z o.o.',
    'Pol-Stal S.A.',
    'HydraTech Sp. k.',
    'Odbiorca Indywidualny',
    'Administrator Systemu',
    'Jan Kowalski (Lider)',
    'admin',
    'leader',
  ]);

  // Scan Markdown files for privacy compliance
  const mdFiles: string[] = [];
  function collectMdFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) collectMdFiles(full);
      else if (f.endsWith('.md')) mdFiles.push(full);
    }
  }
  collectMdFiles(SOURCE_DIR);

  for (const file of mdFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        const error = `Wykryto niedozwolony wzorzec danych w pliku: ${path.relative(ROOT_DIR, file)}`;
        report.privacyErrors.push(error);
        report.privacyAuditPassed = false;
        console.error(`  ❌ ${error}`);
      }
    }
  }

  // 4. Version Drift Detection
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const currentAppVersion = pkg.version || '0.4.4';

  for (const file of mdFiles) {
    const parsed = matter(fs.readFileSync(file, 'utf8'));
    const docVersion = parsed.data.lastUpdatedVersion;
    if (docVersion && docVersion !== currentAppVersion) {
      report.outdatedDocuments.push(
        `${path.relative(ROOT_DIR, file)} (wersja dokumentu: ${docVersion}, wersja aplikacji: ${currentAppVersion})`
      );
    }
  }

  if (report.privacyErrors.length > 0) {
    console.error('❌ AUDYT PRYWATNOŚCI NIE ZALICZONY!');
  } else {
    console.log('✅ Audyt prywatności zakończony pomyślnie! Brak wycieku danych produkcyjnych.');
  }

  return report;
}

if (require.main === module) {
  validateDocumentation().catch((err) => {
    console.error('❌ Błąd podczas walidacji:', err);
    process.exit(1);
  });
}
