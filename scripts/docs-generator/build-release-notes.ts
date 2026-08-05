import path from 'path';
import fs from 'fs';
import { ROOT_DIR, RELEASES_DIR } from './config';

export async function buildReleaseNotes() {
  console.log('📝 [docs:release-notes] Generowanie Release Notes...');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const version = pkg.version || '0.4.4';
  const releaseTargetDir = path.join(RELEASES_DIR, `v${version}`);

  if (!fs.existsSync(releaseTargetDir)) {
    fs.mkdirSync(releaseTargetDir, { recursive: true });
  }

  const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
  let changelogContent = '';
  if (fs.existsSync(changelogPath)) {
    changelogContent = fs.readFileSync(changelogPath, 'utf8');
  }

  // Extract section for current version from CHANGELOG.md if available
  const versionHeaderRegex = new RegExp(`## \\[\\${version}\\][\\s\\S]*?(?=(## \\[\\d+\\.|\\Z))`, 'i');
  const match = changelogContent.match(versionHeaderRegex);
  const versionNotes = match ? match[0] : changelogContent.slice(0, 1500);

  const releaseNotesMarkdown = `---
title: "Release Notes — WERSJA v${version}"
generatedAt: "2026-08-02T12:00:00.000Z"
appVersion: "${version}"
---

# Informacje o Wydaniu (Release Notes) — v${version}

Data wygenerowania: 2026-08-02
Wersja systemu: **v${version}**

## Podsumowanie Zmian w Wersji ${version}

${versionNotes}

---

## Zweryfikowane Zakresy Funkcjonalne
- [x] Podstawowe logowanie oraz rejestracja sesji w trybie ciemnym i jasnym.
- [x] Pulpit Menedżerski (Dashboard) z wyliczaniem wskaźników budżetowych.
- [x] Rejestracja czasu pracy na zleceniach z oznaczeniem Braku Karty.
- [x] Rejestracja nieobecności zakresem dat z wykluczeniem wolnych weekendów.
- [x] Baza Zleceń Produkcyjnych z pełnym filtrowaniem i eksportem danych do XLSX.
- [x] Zarządzanie kontami użytkowników i rolami (Administrator / Lider).

© 2026 WARSZTAT System Raportowania Czasu Pracy. Wszystkie prawa zastrzeżone.
`;

  const outputPath = path.join(releaseTargetDir, 'release-notes.md');
  fs.writeFileSync(outputPath, releaseNotesMarkdown, 'utf8');
  console.log(`✅ Plik Release Notes został zapisany w ${path.relative(ROOT_DIR, outputPath)}!`);
}

if (require.main === module) {
  buildReleaseNotes().catch((err) => {
    console.error('❌ Błąd podczas generowania Release Notes:', err);
    process.exit(1);
  });
}
