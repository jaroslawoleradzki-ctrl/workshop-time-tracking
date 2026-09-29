import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpChapters } from '../src/help/chapters';
import { screenshotManifest } from './manifest';
import { validateScreenshotReferences } from './validation';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(path.join(root, 'public/help')).filter((file) => file.endsWith('.png'));
const failures = validateScreenshotReferences(screenshotManifest, helpChapters, files);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Docs screenshots validated: ${screenshotManifest.length} manifest entry.`);
}
