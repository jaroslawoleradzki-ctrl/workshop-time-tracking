import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { screenshotManifest, type DocsScreenshot } from '../../docs-screenshots/manifest';
import { validateScreenshotReferences } from '../../docs-screenshots/validation';
import { helpChapters, type HelpChapter } from '../help/chapters';

const file = screenshotManifest[0].targetFile;
const validate = (
  manifest: DocsScreenshot[] = [...screenshotManifest],
  chapters: HelpChapter[] = helpChapters,
  files: string[] = [file],
) => validateScreenshotReferences(manifest, chapters, files);

describe('docs screenshot reference validation', () => {
  it('accepts the real manifest, chapters, and asset', () => expect(validate()).toEqual([]));
  it('rejects a missing manifest target and a missing referenced file', () => expect(validate(undefined, undefined, [])).toContain(`Manifest target is missing: ${file}`));
  it('rejects a rendered screenshot reference removed while the manifest entry remains', () => {
    const chapters = helpChapters.map((chapter) => chapter.id === 'logowanie' ? { ...chapter, screenshots: [] } : chapter);
    expect(validate(undefined, chapters)).toContain('Manifest screenshot is not referenced exactly once by its chapter: login-empty');
  });
  it('rejects a screenshot reference absent from the manifest', () => {
    const chapters = helpChapters.map((chapter) => chapter.id === 'logowanie' ? { ...chapter, screenshots: [{ id: 'other', alt: 'Other image' }] } : chapter);
    expect(validate(undefined, chapters)).toContain('Help references a screenshot absent from manifest: other');
  });
  it('rejects a direct Help image that bypasses typed screenshot references', () => {
    const chapters = helpChapters.map((chapter) => chapter.id === 'logowanie' ? { ...chapter, content: createElement('img', { src: '/help/untracked.png' }) } : chapter);
    expect(validate(undefined, chapters)).toContain('Help chapter embeds an image outside typed references: logowanie');
  });
  it('rejects a manifest entry assigned to the wrong or nonexistent chapter', () => {
    expect(validate([{ ...screenshotManifest[0], chapter: 'pierwsze-kroki' }])).toContain('Manifest screenshot is not referenced exactly once by its chapter: login-empty');
    expect(validate([{ ...screenshotManifest[0], chapter: 'unknown' as DocsScreenshot['chapter'] }])).toContain('Manifest chapter does not exist: unknown');
  });
  it('rejects target filename mismatches and orphan image files', () => {
    expect(validate([{ ...screenshotManifest[0], targetFile: 'other.png' }])).toContain('Manifest target is missing: other.png');
    expect(validate(undefined, undefined, [file, 'orphan.png'])).toContain('Help asset is absent from manifest: orphan.png');
  });
  it('rejects duplicate IDs and target filenames', () => {
    const duplicate = { ...screenshotManifest[0] };
    const failures = validate([screenshotManifest[0], duplicate]);
    expect(failures).toContain('Duplicate manifest ID: login-empty');
    expect(failures).toContain(`Duplicate manifest target: ${file}`);
  });
});
