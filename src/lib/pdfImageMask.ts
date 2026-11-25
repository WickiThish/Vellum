import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { pdfjsLib } from './pdfjsSetup';

export interface PixelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Matrix6 = [number, number, number, number, number, number];

function multiplyMatrix(m1: Matrix6, m2: Matrix6): Matrix6 {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMatrix(m: Matrix6, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Extracts canvas-pixel bounding boxes of embedded raster images on a PDF page
 * by walking the PDF.js graphics operator list and transformation matrix stack.
 */
export async function detectPageImageRects(
  page: PDFPageProxy,
  viewport: PageViewport,
  canvasWidth: number,
  canvasHeight: number
): Promise<PixelRect[]> {
  try {
    const opList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    const vt = viewport.transform as Matrix6;

    let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
    const stack: Matrix6[] = [];
    const rects: PixelRect[] = [];

    const imageOps = new Set<number>([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageXObjectRepeat,
    ]);

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];

      if (fn === OPS.save) {
        stack.push([...ctm] as Matrix6);
      } else if (fn === OPS.restore) {
        ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
        ctm = multiplyMatrix(ctm, args as Matrix6);
      } else if (imageOps.has(fn)) {
        const full = multiplyMatrix(vt, ctm);
        const corners: [number, number][] = [
          applyMatrix(full, 0, 0),
          applyMatrix(full, 1, 0),
          applyMatrix(full, 0, 1),
          applyMatrix(full, 1, 1),
        ];

        const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
        const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
        const maxX = Math.min(canvasWidth, Math.ceil(Math.max(...corners.map((c) => c[0]))));
        const maxY = Math.min(canvasHeight, Math.ceil(Math.max(...corners.map((c) => c[1]))));

        const w = maxX - minX;
        const h = maxY - minY;
        // Ignore tiny 1–8px decorative hairline strips or masks
        if (w >= 12 && h >= 12) {
          rects.push({ x0: minX, y0: minY, x1: maxX, y1: maxY });
        }
      }
    }

    return rects;
  } catch {
    return [];
  }
}

/**
 * Builds a fast per-pixel lookup mask (1 = preserve natural photo/image, 0 = transform as page/text).
 * Automatically skips full-page black-and-white scanned book pages so scanned PDFs
 * still get transformed into Charcoal Dark with crisp off-white text.
 */
export function buildPhotoPreservationMask(
  imageData: ImageData,
  rects: PixelRect[]
): Uint8Array | null {
  if (rects.length === 0) return null;

  const { data, width, height } = imageData;
  const pageArea = width * height;
  const validRects: PixelRect[] = [];

  for (const r of rects) {
    const area = (r.x1 - r.x0) * (r.y1 - r.y0);
    const coverage = area / Math.max(1, pageArea);

    // If an image covers >72% of the page, check if it's a B&W scanned text page
    if (coverage > 0.72) {
      let sampled = 0;
      let colorful = 0;
      const stepX = Math.max(1, Math.floor((r.x1 - r.x0) / 40));
      const stepY = Math.max(1, Math.floor((r.y1 - r.y0) / 40));

      for (let y = r.y0; y < r.y1; y += stepY) {
        const row = y * width * 4;
        for (let x = r.x0; x < r.x1; x += stepX) {
          const i = row + x * 4;
          const cr = data[i];
          const cg = data[i + 1];
          const cb = data[i + 2];
          const maxC = Math.max(cr, cg, cb);
          const minC = Math.min(cr, cg, cb);
          if (maxC - minC > 22) colorful++;
          sampled++;
        }
      }

      // Less than 6% colorful pixels across a full-page image -> scanned B&W document page
      if (sampled > 0 && colorful / sampled < 0.06) {
        continue;
      }
    }

    validRects.push(r);
  }

  if (validRects.length === 0) return null;

  const mask = new Uint8Array(width * height);
  for (const r of validRects) {
    for (let y = r.y0; y < r.y1; y++) {
      mask.fill(1, y * width + r.x0, y * width + r.x1);
    }
  }
  return mask;
}
