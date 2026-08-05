import path from 'path';

export const ROOT_DIR = path.resolve(__dirname, '../../');
export const DOCS_DIR = path.join(ROOT_DIR, 'docs');
export const SCHEMA_DIR = path.join(DOCS_DIR, 'schema');
export const SOURCE_DIR = path.join(DOCS_DIR, 'source');
export const IMAGES_DIR = path.join(DOCS_DIR, 'images');
export const RELEASES_DIR = path.join(DOCS_DIR, 'releases');

export const DETERMINISTIC_TIMESTAMP = '2026-08-02T12:00:00.000Z';

export function verifyDocumentationEnvironment() {
  const isDocsMode = process.env.DOCS_MODE === 'true';
  const dbUrl = process.env.DATABASE_URL || '';

  if (!isDocsMode) {
    throw new Error('❌ BŁĄD BEZPIECZEŃSTWA: Generowanie dokumentacji wymaga ustawienia DOCS_MODE=true w środowisku.');
  }

  const dbNameMatch = dbUrl.match(/\/([^?\/]+)(\?|$)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : '';

  if (!dbName.endsWith('_docs')) {
    throw new Error(
      `❌ BŁĄD BEZPIECZEŃSTWA: Wykryto bazę '${dbName}'. Operacje seedowania i screenshotów mogą być wykonywane WYŁĄCZNIE na dedykowanej bazie kończącej się sufiksem '_docs' (np. time_reporting_docs).`
    );
  }

  console.log(`✅ Asercja bezpieczeństwa zaliczona. Połączono z dedykowaną bazą dokumentacyjną '${dbName}'.`);
}
