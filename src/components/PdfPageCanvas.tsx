import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { transformPageImageData } from '../lib/colorTransform';
import { buildPhotoPreservationMask, detectPageImageRects } from '../lib/pdfImageMask';
import { pdfjsLib } from '../lib/pdfjsSetup';
import { PAPER_PRESETS, type TransformSettings } from '../lib/presets';

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  initialPage?: number;
  scale: number;
  settings: TransformSettings;
  /** When true, pdfDoc is already True Vector recolored — render directly at full vector crispness */
  isVectorRecolored?: boolean;
  onVisible?: (pageNumber: number) => void;
}

export function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  initialPage = 1,
  scale,
  settings,
  isVectorRecolored = false,
  onVisible,
}: PdfPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const rawImageCacheRef = useRef<{
    pdfDoc: PDFDocumentProxy;
    scale: number;
    dpr: number;
    width: number;
    height: number;
    data: Uint8ClampedArray;
    photoMask: Uint8Array | null;
  } | null>(null);

  const [isNearViewport, setIsNearViewport] = useState(
    Math.abs(pageNumber - initialPage) <= 1
  );
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: Math.round(612 * scale),
    height: Math.round(792 * scale),
  });
  const [isRendered, setIsRendered] = useState(false);

  // Observe proximity for lazy rendering & active page tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const loadObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsNearViewport(true);
        }
      },
      { rootMargin: '600px 0px' }
    );
    loadObserver.observe(el);

    const activeObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && entries[0].intersectionRatio > 0.35) {
          onVisible?.(pageNumber);
        }
      },
      { threshold: [0.35, 0.6] }
    );
    activeObserver.observe(el);

    return () => {
      loadObserver.disconnect();
      activeObserver.disconnect();
    };
  }, [pageNumber, onVisible]);

  // Step 1: Render vector PDF page + aligned selectable TextLayer
  useEffect(() => {
    if (!isNearViewport) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let activeTextLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null;

    async function renderPage() {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      // High-density vector rendering (2x–3x) so zoomed text stays razor-sharp
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      const viewport = page.getViewport({ scale });
      const hiDpiViewport = page.getViewport({ scale: scale * dpr });

      const cssW = Math.round(viewport.width);
      const cssH = Math.round(viewport.height);
      setDimensions({ width: cssW, height: cssH });

      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      const pixelW = Math.ceil(hiDpiViewport.width);
      const pixelH = Math.ceil(hiDpiViewport.height);

      // If we're using pixel-transform fallback and already cached this exact pdfDoc/scale, reuse cache
      const cached = rawImageCacheRef.current;
      if (
        !isVectorRecolored &&
        cached &&
        cached.pdfDoc === pdfDoc &&
        cached.scale === scale &&
        cached.dpr === dpr &&
        cached.width === pixelW &&
        cached.height === pixelH
      ) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          const copy = new ImageData(
            new Uint8ClampedArray(cached.data),
            cached.width,
            cached.height
          );
          transformPageImageData(copy, settings, cached.photoMask);
          ctx.putImageData(copy, 0, 0);
          setIsRendered(true);
        }
        return;
      }

      canvas.width = pixelW;
      canvas.height = pixelH;

      const ctx = canvas.getContext('2d', { willReadFrequently: !isVectorRecolored });
      if (!ctx) return;

      const preset = PAPER_PRESETS[settings.presetId] ?? PAPER_PRESETS['true-dark'];
      ctx.fillStyle = isVectorRecolored && !settings.showOriginal ? preset.paperHex : '#ffffff';
      ctx.fillRect(0, 0, pixelW, pixelH);

      const imageRectsPromise =
        !isVectorRecolored && !settings.showOriginal
          ? detectPageImageRects(page, hiDpiViewport, pixelW, pixelH)
          : Promise.resolve([]);

      renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport: hiDpiViewport,
      });

      try {
        await renderTask.promise;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'RenderingCancelledException') {
          return;
        }
        throw err;
      }

      if (cancelled) return;

      // Pixel transform only needed when NOT already vector-recolored (e.g. fallback mode)
      if (!isVectorRecolored && !settings.showOriginal) {
        const raw = ctx.getImageData(0, 0, pixelW, pixelH);
        const imageRects = await imageRectsPromise;
        if (cancelled) return;

        const photoMask = buildPhotoPreservationMask(raw, imageRects);
        rawImageCacheRef.current = {
          pdfDoc,
          scale,
          dpr,
          width: pixelW,
          height: pixelH,
          data: new Uint8ClampedArray(raw.data),
          photoMask,
        };

        const transformed = transformPageImageData(raw, settings, photoMask);
        ctx.putImageData(transformed, 0, 0);
      } else {
        rawImageCacheRef.current = null;
      }

      setIsRendered(true);

      // Render native selectable/copyable PDF.js TextLayer aligned 1:1 over the vector canvas
      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv && !cancelled) {
        textLayerDiv.replaceChildren();
        textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
        const textContent = await page.getTextContent();
        if (cancelled) return;

        activeTextLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        await activeTextLayer.render().catch(() => {});
      }
    }

    renderPage().catch((err) => {
      if (!cancelled) {
        console.error(`Failed to render page ${pageNumber}:`, err);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      activeTextLayer?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, pageNumber, scale, isNearViewport, isVectorRecolored, settings.showOriginal]);

  // Step 2: Re-apply pixel transform immediately when using fallback mode
  useEffect(() => {
    if (isVectorRecolored) return;
    const cached = rawImageCacheRef.current;
    const canvas = canvasRef.current;
    if (!cached || cached.pdfDoc !== pdfDoc || !canvas || !isRendered) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const copy = new ImageData(
      new Uint8ClampedArray(cached.data),
      cached.width,
      cached.height
    );
    transformPageImageData(copy, settings, cached.photoMask);
    ctx.putImageData(copy, 0, 0);
  }, [pdfDoc, settings, isRendered, isVectorRecolored]);

  const preset = PAPER_PRESETS[settings.presetId] ?? PAPER_PRESETS['true-dark'];
  const sheetBg = settings.showOriginal ? '#ffffff' : preset.paperHex;

  return (
    <figure className="vellum-page-figure" ref={containerRef} data-page-number={pageNumber}>
      <div
        className="vellum-page-sheet"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          backgroundColor: sheetBg,
        }}
      >
        <canvas
          ref={canvasRef}
          className="vellum-page-canvas"
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            opacity: isRendered ? 1 : 0,
          }}
        />
        <div
          ref={textLayerRef}
          className="textLayer vellum-text-layer"
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
          }}
        />
        {!isRendered && (
          <div className="vellum-page-skeleton" aria-label={`Loading page ${pageNumber}`}>
            <span>Rendering page {pageNumber}…</span>
          </div>
        )}
        <span className="vellum-page-badge" aria-hidden="true">
          {pageNumber}
        </span>
      </div>
    </figure>
  );
}
