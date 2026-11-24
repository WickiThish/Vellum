import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Generates a crisp, multi-page sample PDF right in the browser so visitors
 * on GitHub Pages can immediately experience Vellum without hunting for a file.
 */
export async function generateSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('On Paper, Light, and Comfortable Reading');
  doc.setAuthor('Vellum Sample Library');

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612; // US Letter
  const pageHeight = 792;
  const margin = 68;
  const maxWidth = pageWidth - margin * 2;

  function drawWrappedText(
    page: ReturnType<typeof doc.addPage>,
    text: string,
    x: number,
    startY: number,
    font: typeof serif,
    size: number,
    lineHeight: number,
    color = rgb(0, 0, 0)
  ): number {
    const words = text.split(' ');
    let line = '';
    let y = startY;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(testLine, size);
      if (w > maxWidth && line) {
        page.drawText(line, { x, y, size, font, color });
        line = word;
        y -= lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x, y, size, font, color });
      y -= lineHeight;
    }
    return y;
  }

  // --- Page 1 ---
  const p1 = doc.addPage([pageWidth, pageHeight]);

  p1.drawText('VELLUM SAMPLE DOCUMENT', {
    x: margin,
    y: pageHeight - 58,
    size: 9,
    font: sansBold,
    color: rgb(0.35, 0.35, 0.35),
  });

  p1.drawLine({
    start: { x: margin, y: pageHeight - 68 },
    end: { x: pageWidth - margin, y: pageHeight - 68 },
    thickness: 0.75,
    color: rgb(0.2, 0.2, 0.2),
  });

  p1.drawText('Why White Screens Tire the Eyes', {
    x: margin,
    y: pageHeight - 118,
    size: 26,
    font: serifBold,
    color: rgb(0, 0, 0),
  });

  p1.drawText('Notes on paper reflectance, ink contrast, and long-form digital reading', {
    x: margin,
    y: pageHeight - 144,
    size: 12.5,
    font: serifItalic,
    color: rgb(0.25, 0.25, 0.25),
  });

  let y = pageHeight - 188;

  const p1Paras = [
    'Most PDF documents were designed to be printed on physical paper — not projected directly into your eyes from a backlit LED display. On paper, ambient light bounces gently off textured fibers. On a screen, pure white (#FFFFFF) margins act like a tiny lightbox surrounding every paragraph.',
    'Even when you enable a system blue-light filter, the fundamental problem remains: vast expanses of high-luminance white space paired with maximum-contrast pure black (#000000) glyphs. Over an hour or two of studying textbooks, research papers, or legal drafts, this harsh contrast creates visual fatigue and halation.',
    'Traditional bookmakers understood this centuries ago. Unbleached kraft stock, warm cotton rag, and aged vellum naturally soften the contrast ratio while giving the eye a calm, matte resting surface. Dark espresso or charcoal ink remains effortlessly legible without stinging the retina.',
  ];

  for (const para of p1Paras) {
    y = drawWrappedText(p1, para, margin, y, serif, 12, 19);
    y -= 10;
  }

  // Callout Box with a subtle accent color to showcase color preservation
  const boxHeight = 104;
  const boxY = y - boxHeight + 4;
  p1.drawRectangle({
    x: margin,
    y: boxY,
    width: maxWidth,
    height: boxHeight,
    color: rgb(0.95, 0.96, 0.98),
    borderColor: rgb(0.18, 0.42, 0.68),
    borderWidth: 1.5,
  });

  p1.drawText('Try Switching Presets Above', {
    x: margin + 18,
    y: boxY + boxHeight - 24,
    size: 11.5,
    font: sansBold,
    color: rgb(0.12, 0.34, 0.58),
  });

  drawWrappedText(
    p1,
    'Press keys 1–4 or click Kraft Paper, Warm Parchment, Soft Sepia, or Dim Slate in the toolbar. Press O anytime to compare against the harsh white original, or click Export PDF to save a transformed copy.',
    margin + 18,
    boxY + boxHeight - 44,
    sans,
    10.2,
    15.5,
    rgb(0.15, 0.15, 0.15)
  );

  y = boxY - 34;

  p1.drawText('1. Luminance & Contrast Comparison', {
    x: margin,
    y,
    size: 14.5,
    font: serifBold,
  });
  y -= 24;

  // Simple colored bar chart to demonstrate smart color preservation
  const bars = [
    { label: 'Pure White PDF', pct: 0.96, color: rgb(0.82, 0.28, 0.24) },
    { label: 'Warm Parchment', pct: 0.68, color: rgb(0.84, 0.58, 0.22) },
    { label: 'Kraft Brown Paper', pct: 0.52, color: rgb(0.24, 0.56, 0.42) },
    { label: 'Dim Slate (Night)', pct: 0.22, color: rgb(0.26, 0.46, 0.72) },
  ];

  for (const bar of bars) {
    p1.drawText(bar.label, { x: margin, y: y + 3, size: 10, font: sans, color: rgb(0.1, 0.1, 0.1) });
    const barX = margin + 135;
    const barMaxW = maxWidth - 180;
    p1.drawRectangle({
      x: barX,
      y: y,
      width: barMaxW,
      height: 13,
      color: rgb(0.92, 0.92, 0.92),
    });
    p1.drawRectangle({
      x: barX,
      y: y,
      width: barMaxW * bar.pct,
      height: 13,
      color: bar.color,
    });
    p1.drawText(`${Math.round(bar.pct * 100)}%`, {
      x: barX + barMaxW + 8,
      y: y + 3,
      size: 9.5,
      font: sansBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 24;
  }

  p1.drawText('Page 1 of 2', {
    x: pageWidth / 2 - 24,
    y: 36,
    size: 9.5,
    font: sans,
    color: rgb(0.4, 0.4, 0.4),
  });

  // --- Page 2 ---
  const p2 = doc.addPage([pageWidth, pageHeight]);

  p2.drawText('VELLUM SAMPLE DOCUMENT', {
    x: margin,
    y: pageHeight - 58,
    size: 9,
    font: sansBold,
    color: rgb(0.35, 0.35, 0.35),
  });

  p2.drawLine({
    start: { x: margin, y: pageHeight - 68 },
    end: { x: pageWidth - margin, y: pageHeight - 68 },
    thickness: 0.75,
    color: rgb(0.2, 0.2, 0.2),
  });

  let y2 = pageHeight - 114;
  p2.drawText('2. How Vellum Transforms Pages Locally', {
    x: margin,
    y: y2,
    size: 17,
    font: serifBold,
  });
  y2 -= 30;

  const p2Paras = [
    'Everything in Vellum happens directly inside your web browser. Your PDFs are never uploaded to any server, making it safe for private research notes, financial statements, textbooks, and manuscripts.',
    'Rather than slapping a muddy brown filter over the entire document, Vellum maps each pixel by luminance: pure white page backgrounds smoothly become warm Kraft, Parchment, Sepia, or Dim Slate surfaces, while stark black ink softens into deep espresso or charcoal.',
    'When Preserve Colors is enabled, colored charts, syntax-highlighted code, links, and embedded photographs keep their natural hues while harmonizing with the chosen paper stock — just as if they were printed onto tactile brown paper.',
    'Once you find a comfortable combination of paper tone, ink softness, and fiber grain, you can either keep reading right here in Focus Mode (press F) or export a brand-new PDF to read on your tablet, e-reader, or laptop.',
  ];

  for (const para of p2Paras) {
    y2 = drawWrappedText(p2, para, margin, y2, serif, 12, 19);
    y2 -= 12;
  }

  y2 -= 10;
  p2.drawText('Keyboard Shortcuts', {
    x: margin,
    y: y2,
    size: 13.5,
    font: serifBold,
  });
  y2 -= 24;

  const shortcuts = [
    '1, 2, 3, 4   —   Switch between Kraft Paper, Warm Parchment, Soft Sepia, and Dim Slate',
    'O            —   Toggle Original white PDF to compare eye comfort',
    'F            —   Toggle distraction-free Focus Mode',
    '+ / -        —   Zoom in and out comfortably',
  ];

  for (const line of shortcuts) {
    p2.drawText(line, {
      x: margin + 12,
      y: y2,
      size: 10.5,
      font: sans,
      color: rgb(0.15, 0.15, 0.15),
    });
    y2 -= 20;
  }

  p2.drawText('Page 2 of 2', {
    x: pageWidth / 2 - 24,
    y: 36,
    size: 9.5,
    font: sans,
    color: rgb(0.4, 0.4, 0.4),
  });

  return doc.save();
}
