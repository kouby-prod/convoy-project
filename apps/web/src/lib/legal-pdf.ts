import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { LegalSection } from '@/components/legal/legal-page';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const BLACK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const WARNING = rgb(0.55, 0.15, 0.15);

export interface LegalPdfInput {
  title: string;
  disclaimer?: string;
  lastUpdated: string;
  sections: LegalSection[];
}

const encodableCache = new Map<string, boolean>();

/**
 * Base14 fonts only support WinAnsi encoding. Translated copy can contain
 * emoji or other symbols outside that set (pdf-lib throws on those), so drop
 * whatever the embedded font can't render instead of failing the whole PDF.
 */
function sanitizeForPdf(text: string, font: PDFFont): string {
  return Array.from(text)
    .filter((char) => {
      let ok = encodableCache.get(char);
      if (ok === undefined) {
        try {
          font.widthOfTextAtSize(char, 10);
          ok = true;
        } catch {
          ok = false;
        }
        encodableCache.set(char, ok);
      }
      return ok;
    })
    .join('');
}

interface WrappedLine {
  words: string[];
  /** False for a line ending a paragraph/manual break — that edge stays ragged, never stretched. */
  justifiable: boolean;
}

function wrapLines(text: string, size: number, font: PDFFont): WrappedLine[] {
  const lines: WrappedLine[] = [];
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push({ words: [], justifiable: false });
      continue;
    }
    const segments: string[][] = [];
    let current: string[] = [];
    let currentWidth = 0;
    const spaceWidth = font.widthOfTextAtSize(' ', size);
    for (const word of words) {
      const wordWidth = font.widthOfTextAtSize(word, size);
      const tentativeWidth = current.length ? currentWidth + spaceWidth + wordWidth : wordWidth;
      if (current.length && tentativeWidth > CONTENT_WIDTH) {
        segments.push(current);
        current = [word];
        currentWidth = wordWidth;
      } else {
        current.push(word);
        currentWidth = tentativeWidth;
      }
    }
    if (current.length) segments.push(current);

    segments.forEach((segmentWords, i) => {
      const isLastOfSegment = i === segments.length - 1;
      lines.push({ words: segmentWords, justifiable: !isLastOfSegment && segmentWords.length > 1 });
    });
  }
  return lines;
}

function drawLine(
  page: PDFPage,
  { words, justifiable }: WrappedLine,
  { x, y, size, font, color, justify }: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb>; justify: boolean },
) {
  if (words.length === 0) return;
  const text = words.join(' ');

  if (!justify || !justifiable) {
    page.drawText(text, { x, y, size, font, color });
    return;
  }

  const spaceWidth = font.widthOfTextAtSize(' ', size);
  const wordsWidth = words.reduce((sum, word) => sum + font.widthOfTextAtSize(word, size), 0);
  const naturalWidth = wordsWidth + spaceWidth * (words.length - 1);
  const gap = spaceWidth + (CONTENT_WIDTH - naturalWidth) / (words.length - 1);

  let cursor = x;
  for (const word of words) {
    page.drawText(word, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(word, size) + gap;
  }
}

export async function renderLegalPdf({ title, disclaimer, lastUpdated, sections }: LegalPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const clean = (text: string) => sanitizeForPdf(text, font);
  title = clean(title);
  disclaimer = disclaimer ? clean(disclaimer) : disclaimer;
  lastUpdated = clean(lastUpdated);
  sections = sections.map((section) => ({
    heading: clean(section.heading),
    body: clean(section.body),
  }));

  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawParagraph = (
    text: string,
    { size = 10, font: f = font, color = BLACK, gapAfter = 8, lineGap = 4, justify = false } = {},
  ) => {
    for (const wrapped of wrapLines(text, size, f)) {
      ensureSpace(size + lineGap);
      drawLine(page, wrapped, { x: MARGIN, y, size, font: f, color, justify });
      y -= size + lineGap;
    }
    y -= gapAfter;
  };

  drawParagraph(title, { size: 20, font: bold, gapAfter: 4 });
  drawParagraph(lastUpdated, { size: 9, color: MUTED, gapAfter: 14 });

  if (disclaimer) {
    drawParagraph(disclaimer, { size: 9, color: WARNING, gapAfter: 16, justify: true });
  }

  for (const section of sections) {
    ensureSpace(28);
    drawParagraph(section.heading, { size: 13, font: bold, gapAfter: 4 });
    for (const paragraph of section.body.split('\n\n')) {
      drawParagraph(paragraph, { gapAfter: 8, justify: true });
    }
    y -= 6;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
