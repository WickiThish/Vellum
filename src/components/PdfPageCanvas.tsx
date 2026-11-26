import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { transformPageImageData } from '../lib/colorTransform';
import { buildPhotoPreservationMask, detectPageImageRects } from '../lib/pdfImageMask';
import { PAPER_PRESETS, type TransformSettings } from '../lib/presets';

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  initialPage?: number;
  scale: number;
  settings: TransformSettings;
  onVisible?: (pageNumber: number) => void;
}

export function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  initialPage = 1,
  scale,
  settings,
  onVisible,
}: PdfPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rawImageCacheRef = useRef<{
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

  // Step 1: Rasterize PDF page via PDF.js only when doc, pageNumber, scale, or visibility changes
  useEffect(() => {
    if (!isNearViewport) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;

    async function renderBasePage() {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      // Super-sample at least 1.75x (up to 2.5x on HiDPI) so text stays crystal clear on all screens
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1.75), 2.5);
      const viewport = page.getViewport({ scale });
      const hiDpiViewport = page.getViewport({ scale: scale * dpr });

      const cssW = Math.round(viewport.width);
      const cssH = Math.round(viewport.height);
      setDimensions({ width: cssW, height: cssH });

      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      const pixelW = Math.ceil(hiDpiViewport.width);
      const pixelH = Math.ceil(hiDpiViewport.height);

      // Reuse cached raw pixels + image mask if scale & dpr haven't changed
      const cached = rawImageCacheRef.current;
      if (
        cached &&
        cached.scale === scale &&
        cached.dpr === dpr &&
        cached.width === pixelW &&
        cached.height === pixelH
      ) {
        applyTransformFromCache();
        return;
      }

      canvas.width = pixelW;
      canvas.height = pixelH;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Paint pure white base so transparent PDFs map cleanly to paper/charcoal tone
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pixelW, pixelH);

      // Detect embedded raster photos/images in parallel with rasterization
      const imageRectsPromise = detectPageImageRects(page, hiDpiViewport, pixelW, pixelH);

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

      const raw = ctx.getImageData(0, 0, pixelW, pixelH);
      const imageRects = await imageRectsPromise;
      if (cancelled) return;

      const photoMask = buildPhotoPreservationMask(raw, imageRects);

      rawImageCacheRef.current = {
        scale,
        dpr,
        width: pixelW,
        height: pixelH,
        data: new Uint8ClampedArray(raw.data),
        photoMask,
      };

      const transformed = transformPageImageData(raw, settings, photoMask);
      ctx.putImageData(transformed, 0, 0);
      setIsRendered(true);
    }

    function applyTransformFromCache() {
      const cached = rawImageCacheRef.current;
      const canvas = canvasRef.current;
      if (!cached || !canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const copy = new ImageData(
        new Uint8ClampedArray(cached.data),
        cached.width,
        cached.height
      );
      transformPageImageData(copy, settings, cached.photoMask);
      ctx.putImageData(copy, 0, 0);
      setIsRendered(true);
    }

    renderBasePage().catch((err) => {
      if (!cancelled) {
        console.error(`Failed to render page ${pageNumber}:`, err);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, pageNumber, scale, isNearViewport]);

  // Step 2: Instantly re-apply color/ink/grain transform when settings change (no PDF re-rasterization!)
  useEffect(() => {
    const cached = rawImageCacheRef.current;
    const canvas = canvasRef.current;
    if (!cached || !canvas || !isRendered) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const copy = new ImageData(
      new Uint8ClampedArray(cached.data),
      cached.width,
      cached.height
    );
    transformPageImageData(copy, settings, cached.photoMask);
    ctx.putImageData(copy, 0, 0);
  }, [settings, isRendered]);

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
        {!isRendered && (
          <div className="vellum-page-skeleton" aria-label={`Loading page ${pageNumber}`}>
            <span>Rendering page {pageNumber}…</span>
          </div>
        )}
      </div>
      <figcaption className="vellum-page-caption">Page {pageNumber}</figcaption>
    </figure>
  );
}
