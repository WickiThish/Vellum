import { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { transformPageImageData } from './colorTransform';
import { buildPhotoPreservationMask, detectPageImageRects } from './pdfImageMask';
import { PAPER_PRESETS, type TransformSettings } from './presets';

export type ExportQuality = 'standard' | 'high';

export interface ExportProgress {
  currentPage: number;
  totalPages: number;
  stage: 'rendering' | 'saving';
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode PDF page image.'));
          return;
        }
        blob
          .arrayBuffer()
          .then((buf) => resolve(new Uint8Array(buf)))
          .catch(reject);
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Exports the entire PDF with the active Vellum paper preset & ink transformation
 * baked into every page at its original point dimensions.
 */
export async function exportTransformedPdf(
  pdfDoc: PDFDocumentProxy,
  settings: TransformSettings,
  originalFileName: string,
  quality: ExportQuality,
  onProgress?: (progress: ExportProgress) => void
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const outDoc = await PDFDocument.create();
  const preset = PAPER_PRESETS[settings.presetId] ?? PAPER_PRESETS['true-dark'];
  const baseName = originalFileName.replace(/\.pdf$/i, '') || 'document';
  outDoc.setTitle(`${baseName} (${preset.name})`);
  outDoc.setProducer('Vellum Eye-Comfort PDF Reader');

  const renderScale = quality === 'high' ? 2.25 : 1.75;
  const jpegQuality = quality === 'high' ? 0.94 : 0.88;
  const totalPages = pdfDoc.numPages;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context for PDF export.');
  }

  // Always apply the preset on export even if user had "Compare Original" toggled on
  const exportSettings: TransformSettings = {
    ...settings,
    showOriginal: false,
  };

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({ currentPage: pageNum, totalPages, stage: 'rendering' });

    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale: renderScale });

    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);

    // Fill pure white first so transparent PDF backgrounds map cleanly to paper color
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imageRectsPromise = detectPageImageRects(
      page,
      renderViewport,
      canvas.width,
      canvas.height
    );

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport: renderViewport,
    }).promise;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const imageRects = await imageRectsPromise;
    const photoMask = buildPhotoPreservationMask(imageData, imageRects);
    transformPageImageData(imageData, exportSettings, photoMask);
    ctx.putImageData(imageData, 0, 0);

    const jpgBytes = await canvasToJpegBytes(canvas, jpegQuality);
    const embeddedImage = await outDoc.embedJpg(jpgBytes);

    const outPage = outDoc.addPage([baseViewport.width, baseViewport.height]);
    outPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: baseViewport.width,
      height: baseViewport.height,
    });

    page.cleanup();
  }

  onProgress?.({ currentPage: totalPages, totalPages, stage: 'saving' });
  const bytes = await outDoc.save();
  const fileName = `${baseName}-vellum-${preset.id}.pdf`;

  return { bytes, fileName };
}

export function triggerPdfDownload(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
