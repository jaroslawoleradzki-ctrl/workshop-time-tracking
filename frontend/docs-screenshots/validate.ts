import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotManifest } from './manifest';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chapters = readFileSync(path.join(root, 'src/help/chapters.tsx'), 'utf8');
const failures: string[] = []; const targets = new Set<string>();
for (const screenshot of screenshotManifest) { if (targets.has(screenshot.targetFile)) failures.push(`Duplicate manifest target: ${screenshot.targetFile}`); targets.add(screenshot.targetFile); if (!existsSync(path.join(root, 'public/help', screenshot.targetFile))) failures.push(`Manifest target is missing: ${screenshot.targetFile}`); if (!chapters.includes(screenshot.targetFile)) failures.push(`Manifest target is not referenced by Help: ${screenshot.targetFile}`); }
const referenced = [...chapters.matchAll(/help\/([\w.-]+\.png)/g)].map((match) => match[1]); for (const file of referenced) if (!targets.has(file)) failures.push(`Help references an image absent from manifest: ${file}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); } console.log(`Docs screenshots validated: ${screenshotManifest.length} manifest entry.`);
