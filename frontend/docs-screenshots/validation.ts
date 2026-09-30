import { Children, isValidElement, type ReactNode } from 'react';
import type { HelpChapter } from '../src/help/chapters';
import type { DocsScreenshot } from './manifest';

type ChapterReferences = Pick<HelpChapter, 'id' | 'screenshots' | 'content'>;

function hasUntrackedHelpImage(node: ReactNode): boolean {
  let found = false;
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { src?: unknown; children?: ReactNode };
    if (child.type === 'img' && typeof props.src === 'string' && props.src.startsWith('/help/')) found = true;
    if (hasUntrackedHelpImage(props.children)) found = true;
  });
  return found;
}

export function validateScreenshotReferences(
  manifest: readonly DocsScreenshot[],
  chapters: readonly ChapterReferences[],
  files: readonly string[],
): string[] {
  const failures: string[] = [];
  const ids = new Set<string>();
  const targets = new Set<string>();
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  const references = new Map<string, string[]>();
  const assetFiles = new Set(files);

  for (const chapter of chapters) {
    if (hasUntrackedHelpImage(chapter.content)) failures.push(`Help chapter embeds an image outside typed references: ${chapter.id}`);
    for (const reference of chapter.screenshots) {
      const usedBy = references.get(reference.id) ?? [];
      usedBy.push(chapter.id);
      references.set(reference.id, usedBy);
    }
  }

  for (const screenshot of manifest) {
    if (ids.has(screenshot.id)) failures.push(`Duplicate manifest ID: ${screenshot.id}`);
    ids.add(screenshot.id);
    if (targets.has(screenshot.targetFile)) failures.push(`Duplicate manifest target: ${screenshot.targetFile}`);
    targets.add(screenshot.targetFile);
    if (!/^[\w.-]+\.png$/.test(screenshot.targetFile)) failures.push(`Invalid manifest filename: ${screenshot.targetFile}`);
    if (!assetFiles.has(screenshot.targetFile)) failures.push(`Manifest target is missing: ${screenshot.targetFile}`);
    if (!chapterIds.has(screenshot.chapter)) failures.push(`Manifest chapter does not exist: ${screenshot.chapter}`);
    const usedBy = references.get(screenshot.id) ?? [];
    if (usedBy.length !== 1 || usedBy[0] !== screenshot.chapter) {
      failures.push(`Manifest screenshot is not referenced exactly once by its chapter: ${screenshot.id}`);
    }
  }

  for (const [id, usedBy] of references) {
    if (!ids.has(id)) failures.push(`Help references a screenshot absent from manifest: ${id}`);
    if (usedBy.length > 1) failures.push(`Duplicate Help screenshot reference: ${id}`);
  }
  for (const file of files) {
    if (!targets.has(file)) failures.push(`Help asset is absent from manifest: ${file}`);
  }
  return failures;
}
