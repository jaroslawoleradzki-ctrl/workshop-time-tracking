import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { marked } from 'marked';
import { chromium } from 'playwright';
import { 
  Document, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table, 
  TableRow, 
  TableCell, 
  BorderStyle, 
  WidthType, 
  AlignmentType, 
  Header, 
  Footer, 
  PageNumber, 
  ImageRun, 
  Packer 
} from 'docx';
import { ROOT_DIR, SOURCE_DIR, RELEASES_DIR, IMAGES_DIR, DETERMINISTIC_TIMESTAMP } from './config';

export async function buildDocuments() {
  console.log('📄 [docs:build] Generowanie dokumentów DOCX oraz PDF...');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const version = pkg.version || '0.4.4';
  const releaseTargetDir = path.join(RELEASES_DIR, `v${version}`);

  if (!fs.existsSync(releaseTargetDir)) {
    fs.mkdirSync(releaseTargetDir, { recursive: true });
  }

  // 1. Collect and sort all Markdown source files
  const mdFiles: Array<{ filePath: string; frontmatter: any; content: string }> = [];

  function readDirRecursive(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) readDirRecursive(full);
      else if (f.endsWith('.md')) {
        const fileContent = fs.readFileSync(full, 'utf8');
        const parsed = matter(fileContent);
        mdFiles.push({ filePath: full, frontmatter: parsed.data, content: parsed.content });
      }
    }
  }
  readDirRecursive(SOURCE_DIR);

  // Sort files by frontmatter order
  mdFiles.sort((a, b) => (a.frontmatter.order || 99) - (b.frontmatter.order || 99));

  const userDocs = mdFiles.filter((d) => d.frontmatter.includeInUserManual !== false);
  const adminDocs = mdFiles.filter((d) => d.frontmatter.includeInAdminManual === true);

  // Build User Manual in DOCX and PDF
  console.log('  -> Generowanie Instrukcji Użytkownika (user-manual.docx & user-manual.pdf)...');
  await generateDocx(userDocs, path.join(releaseTargetDir, 'user-manual.docx'), 'Instrukcja Użytkownika Systemu WARSZTAT', version);
  await generatePdf(userDocs, path.join(releaseTargetDir, 'user-manual.pdf'), 'Instrukcja Użytkownika Systemu WARSZTAT', version);

  if (process.env.DOCS_USER_ONLY !== 'true') {
    console.log('  -> Generowanie Instrukcji Administratora (admin-manual.docx & admin-manual.pdf)...');
    await generateDocx(adminDocs, path.join(releaseTargetDir, 'admin-manual.docx'), 'Instrukcja Administratora Systemu WARSZTAT', version);
    await generatePdf(adminDocs, path.join(releaseTargetDir, 'admin-manual.pdf'), 'Instrukcja Administratora Systemu WARSZTAT', version);
  }

  console.log('✅ Generowanie plików DOCX oraz PDF zakończone pomyślnie!');
}


async function generateDocx(
  items: Array<{ filePath: string; frontmatter: any; content: string }>,
  outputPath: string,
  title: string,
  version: string
) {
  const children: any[] = [];

  // Cover Page
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 300 },
      children: [
        new TextRun({ text: 'SYSTEM WARSZTAT', bold: true, size: 36, color: '1E293B' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
      children: [
        new TextRun({ text: title, bold: true, size: 48, color: '0F172A' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({ text: `Wersja systemu: v${version}`, size: 24, color: '475569' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 2000 },
      children: [
        new TextRun({ text: `Data wygenerowania: 2026-08-02`, size: 20, color: '64748B' }),
      ],
    })
  );

  // Document Content
  for (const item of items) {
    const tokens = marked.lexer(item.content);

    for (const token of tokens) {
      if (token.type === 'heading') {
        let level = HeadingLevel.HEADING_1;
        if (token.depth === 2) level = HeadingLevel.HEADING_2;
        if (token.depth === 3) level = HeadingLevel.HEADING_3;
        if (token.depth >= 4) level = HeadingLevel.HEADING_4;

        children.push(
          new Paragraph({
            heading: level,
            spacing: { before: 300, after: 120 },
            children: [new TextRun({ text: token.text, bold: true, color: '0F172A' })],
          })
        );
      } else if (token.type === 'paragraph') {
        // Check if paragraph contains ONLY an image (standalone image paragraph)
        const imgOnlyMatch = token.raw.trim().match(/^!\[(.*?)\]\(([^)]+)\)$/);
        if (imgOnlyMatch) {
          const caption = imgOnlyMatch[1];
          const imgRelPath = imgOnlyMatch[2];
          const fullImgPath = path.join(ROOT_DIR, imgRelPath);

          if (fs.existsSync(fullImgPath)) {
            const imgBuffer = fs.readFileSync(fullImgPath);
            // Calculate aspect ratio to fit width properly
            children.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 120 },
                children: [
                  new ImageRun({
                    data: imgBuffer,
                    transformation: { width: 560, height: 350 },
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
                children: [new TextRun({ text: caption, italic: true, size: 18, color: '64748B' })],
              })
            );
          } else {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `[Obraz niedostępny: ${imgRelPath}]`, italic: true, color: 'CC0000', size: 20 })],
              })
            );
          }
        } else {
          // Strip markdown inline syntax to get plain text, preserve emoji and special chars
          const plainText = stripInlineMarkdown(token.raw.trim());
          // Detect italic caption lines (start with *text*)
          const isItalicCaption = token.raw.trim().startsWith('*') && token.raw.trim().endsWith('*') && !token.raw.trim().startsWith('**');
          children.push(
            new Paragraph({
              spacing: { after: 140 },
              children: [new TextRun({ 
                text: isItalicCaption ? plainText : plainText, 
                size: 22, 
                color: isItalicCaption ? '64748B' : '334155',
                italic: isItalicCaption,
              })],
            })
          );
        }
      } else if (token.type === 'table') {
        const rows: TableRow[] = [];
        // Header Row
        const headerCells = token.header.map(
          (h: any) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: h.text, bold: true, color: 'FFFFFF' })] })],
              shading: { fill: '1E293B' },
            })
        );
        rows.push(new TableRow({ children: headerCells }));

        // Body Rows
        for (const row of token.rows) {
          const cells = row.map(
            (c: any) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: c.text, size: 20 })] })],
              })
          );
          rows.push(new TableRow({ children: cells }));
        }

        children.push(
          new Table({
            rows: rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `WARSZTAT — ${title} v${version}`, size: 18, color: '94A3B8' })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Strona ' }),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                  new TextRun({ text: ' z ' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        },
        children: children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// Strip markdown inline syntax (bold, italic, code, links) to plain text
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')       // remove images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → link text
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // **bold**
    .replace(/\*([^*]+)\*/g, '$1')           // *italic*
    .replace(/`([^`]+)`/g, '$1')             // `code`
    .replace(/~~([^~]+)~~/g, '$1')           // ~~strikethrough~~
    .trim();
}

async function generatePdf(
  items: Array<{ filePath: string; frontmatter: any; content: string }>,
  outputPath: string,
  title: string,
  version: string
) {
  let bodyHtml = '';

  for (const item of items) {
    let htmlPart = await marked.parse(item.content);
    // Replace relative markdown image paths with absolute file:// URLs for Playwright
    // marked generates: src="docs/images/foo.png" — replace with absolute path
    htmlPart = htmlPart.replace(/src="(docs\/[^"]+)"/g, (_, relPath) => {
      const absPath = path.join(ROOT_DIR, relPath);
      return `src="file://${absPath}"`;
    });
    bodyHtml += `<div class="chapter">${htmlPart}</div>`;
  }

  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page {
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1e293b;
            line-height: 1.6;
            background: #ffffff;
          }
          .cover {
            text-align: center;
            padding-top: 150px;
            page-break-after: always;
          }
          .cover h1 { font-size: 32px; color: #0f172a; margin-bottom: 10px; }
          .cover h2 { font-size: 24px; color: #3b82f6; margin-bottom: 40px; }
          .cover .meta { font-size: 14px; color: #64748b; }
          .chapter { page-break-after: always; }
          h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px; }
          h2 { color: #1e293b; margin-top: 24px; }
          h3 { color: #334155; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
          th { background-color: #0f172a; color: #ffffff; font-weight: 600; }
          tr:nth-child(even) { background-color: #f8fafc; }
          img { max-width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 6px; display: block; margin: 16px auto; }
          blockquote { border-left: 4px solid #3b82f6; background-color: #eff6ff; padding: 12px 16px; margin: 16px 0; }
        </style>
      </head>
      <body>
        <div class="cover">
          <h1>SYSTEM WARSZTAT</h1>
          <h2>${title}</h2>
          <div class="meta">
            <p>Wersja systemu: v${version}</p>
            <p>Data wygenerowania: 2026-08-02</p>
          </div>
        </div>
        ${bodyHtml}
      </body>
    </html>
  `;

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security'],
  });
  const page = await browser.newPage();
  // Allow local file:// image access
  await page.setContent(fullHtml, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size: 9px; width: 100%; text-align: right; color: #94a3b8; padding-right: 15mm;">WARSZTAT — ${title} v${version}</div>`,
    footerTemplate: `<div style="font-size: 9px; width: 100%; text-align: center; color: #94a3b8;">Strona <span class="pageNumber"></span> z <span class="totalPages"></span></div>`,
  });
  await browser.close();
}

if (require.main === module) {
  buildDocuments().catch((err) => {
    console.error('❌ Błąd podczas budowania dokumentów:', err);
    process.exit(1);
  });
}
