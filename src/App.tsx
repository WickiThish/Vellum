import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { ExportModal } from './components/ExportModal';
import { LandingView } from './components/LandingView';
import { PdfPageCanvas } from './components/PdfPageCanvas';
import { ReaderToolbar, type ViewMode } from './components/ReaderToolbar';
import {
  getLibraryBook,
  listLibraryBooks,
  makeBookId,
  removeBookFromLibrary,
  saveBookToLibrary,
  updateBookProgress,
  type LibraryBookMeta,
} from './lib/libraryDb';
import { pdfjsLib } from './lib/pdfjsSetup';
import {
  DEFAULT_SETTINGS,
  PAPER_PRESETS,
  PRESET_LIST,
  resolvePresetId,
  type PresetId,
  type TransformSettings,
} from './lib/presets';
import { generateSamplePdf } from './lib/samplePdf';
import { exportVectorPdf } from './lib/vectorPdfExporter';

const MIN_SCALE = 0.55;
const MAX_SCALE = 3.0;

function detectDefaultViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'scroll';
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return isTouch || window.innerWidth <= 900 ? 'paged' : 'scroll';
}

function computeFitScale(pagePointWidth: number): number {
  if (typeof window === 'undefined') return 1.15;
  const horizontalPad = window.innerWidth <= 640 ? 20 : 48;
  const maxWidth =
    window.innerWidth <= 1024
      ? window.innerWidth - horizontalPad
      : Math.min(window.innerWidth - horizontalPad, 920);
  const fit = maxWidth / Math.max(200, pagePointWidth);
  return Math.max(MIN_SCALE, Math.min(1.6, +fit.toFixed(2)));
}

export default function App() {
  const [originalPdfDoc, setOriginalPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [vectorPdfDoc, setVectorPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const originalTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const vectorTaskRef = useRef<PDFDocumentLoadingTask | null>(null);

  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [resumePage, setResumePage] = useState<number>(1);
  const [basePageWidth, setBasePageWidth] = useState<number>(612);
  const [scale, setScale] = useState<number>(() => computeFitScale(612));
  const [viewMode, setViewMode] = useState<ViewMode>(detectDefaultViewMode);
  const [settings, setSettings] = useState<TransformSettings>(DEFAULT_SETTINGS);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryBooks, setLibraryBooks] = useState<LibraryBookMeta[]>([]);

  // Avoid overwriting saved lastPage while we're scrolling to the resumed page
  const isResumingRef = useRef<boolean>(false);
  // Touch swipe tracking for tablet/phone single-page mode
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const activePdfDoc = settings.showOriginal
    ? originalPdfDoc
    : (vectorPdfDoc ?? originalPdfDoc);
  const usingVectorDoc = !settings.showOriginal && vectorPdfDoc !== null;

  const refreshLibrary = useCallback(async () => {
    const books = await listLibraryBooks();
    setLibraryBooks(books);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listLibraryBooks().then((books) => {
      if (!cancelled) setLibraryBooks(books);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build True Vector recolored PDF in-memory whenever the document or reading settings change
  useEffect(() => {
    if (!originalBytes || settings.showOriginal) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { bytes: recoloredBytes } = await exportVectorPdf(
          originalBytes,
          settings,
          fileName || 'document.pdf'
        );
        if (cancelled) return;

        const nextTask = pdfjsLib.getDocument({ data: recoloredBytes });
        const nextDoc = await nextTask.promise;
        if (cancelled) {
          nextTask.destroy().catch(() => {});
          return;
        }

        const prevTask = vectorTaskRef.current;
        vectorTaskRef.current = nextTask;
        setVectorPdfDoc(nextDoc);
        // Destroy previous vector worker slightly after React swaps to the new doc
        setTimeout(() => prevTask?.destroy().catch(() => {}), 300);
      } catch (err) {
        // Gracefully fall back to pixel transform on originalPdfDoc if a PDF cannot be vector-rewritten
        console.warn('Vector live recolor fallback:', err);
        if (!cancelled) {
          setVectorPdfDoc(null);
        }
      }
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    originalBytes,
    fileName,
    settings.presetId,
    settings.inkSoftness,
    settings.preserveColors,
    settings.showOriginal,
    settings,
  ]);

  // Re-fit page width smoothly when rotating a tablet or resizing the window
  useEffect(() => {
    if (!originalPdfDoc) return;
    let timeoutId: number | undefined;
    function onResize() {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        if (window.innerWidth <= 1024) {
          setScale(computeFitScale(basePageWidth));
        }
      }, 140);
    }
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', onResize);
    };
  }, [originalPdfDoc, basePageWidth]);

  // Ctrl + Mouse Wheel smooth zoom (works in both normal & Full Screen modes)
  useEffect(() => {
    if (!originalPdfDoc) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s + delta).toFixed(2))));
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [originalPdfDoc]);

  const enterFullscreen = useCallback(() => {
    setFocusMode(true);
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    setFocusMode(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        setFocusMode(false);
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const scrollToPage = useCallback((pageNum: number) => {
    if (pageNum <= 1) {
      window.scrollTo({ top: 0 });
      return;
    }
    isResumingRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.querySelector(`[data-page-number="${pageNum}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
        setTimeout(() => {
          isResumingRef.current = false;
        }, 450);
      });
    });
  }, []);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!originalPdfDoc) return;
      const clamped = Math.min(Math.max(1, nextPage), originalPdfDoc.numPages);
      setCurrentPage(clamped);
      setResumePage(clamped);
      if (activeBookId) {
        updateBookProgress(activeBookId, { lastPage: clamped });
      }
      if (viewMode === 'scroll') {
        scrollToPage(clamped);
      } else {
        window.scrollTo({ top: 0 });
      }
    },
    [originalPdfDoc, activeBookId, viewMode, scrollToPage]
  );

  const handleToggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next: ViewMode = prev === 'scroll' ? 'paged' : 'scroll';
      if (next === 'scroll') {
        setTimeout(() => scrollToPage(currentPage), 30);
      } else {
        window.scrollTo({ top: 0 });
      }
      return next;
    });
  }, [currentPage, scrollToPage]);

  const loadPdfBytes = useCallback(
    async (
      bytes: Uint8Array,
      name: string,
      options?: { bookId?: string; startPage?: number; presetId?: PresetId; saveToLibrary?: boolean }
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const workerBytes = bytes.slice();
        const loadingTask = pdfjsLib.getDocument({ data: workerBytes });
        const doc = await loadingTask.promise;

        originalTaskRef.current?.destroy().catch(() => {});
        originalTaskRef.current = loadingTask;
        vectorTaskRef.current?.destroy().catch(() => {});
        vectorTaskRef.current = null;
        setVectorPdfDoc(null);

        const firstPage = await doc.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        setBasePageWidth(firstViewport.width);
        setScale(computeFitScale(firstViewport.width));

        const bookId = options?.bookId ?? makeBookId(name, bytes.byteLength);
        let targetPage = options?.startPage ?? 1;

        if (options?.saveToLibrary !== false) {
          try {
            const saved = await saveBookToLibrary(bytes, {
              id: bookId,
              name,
              fileSize: bytes.byteLength,
              totalPages: doc.numPages,
              lastPage: targetPage,
              presetId: options?.presetId ?? settings.presetId,
            });
            targetPage = Math.min(Math.max(1, saved.lastPage), doc.numPages);
            refreshLibrary();
          } catch {
            // Non-fatal if browser storage quota is exceeded
          }
        }

        if (options?.presetId) {
          const validPresetId = resolvePresetId(options.presetId);
          const p = PAPER_PRESETS[validPresetId];
          setSettings((prev) => ({
            ...prev,
            presetId: validPresetId,
            grain: p.defaultGrain,
            inkSoftness: p.defaultSoftness,
            showOriginal: false,
          }));
        }

        setOriginalBytes(bytes.slice());
        setActiveBookId(bookId);
        setFileName(name);
        setResumePage(targetPage);
        setCurrentPage(targetPage);
        setOriginalPdfDoc(doc);
        setFocusMode(false);
        if (viewMode === 'scroll') {
          scrollToPage(targetPage);
        } else {
          window.scrollTo({ top: 0 });
        }
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Could not open that PDF. Please check that it is a valid, unencrypted PDF file.');
      } finally {
        setIsLoading(false);
      }
    },
    [refreshLibrary, scrollToPage, settings.presetId, viewMode]
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Please select a PDF (.pdf) file.');
        return;
      }
      const buffer = await file.arrayBuffer();
      await loadPdfBytes(new Uint8Array(buffer), file.name, { saveToLibrary: true });
    },
    [loadPdfBytes]
  );

  const handleOpenLibraryBook = useCallback(
    async (bookId: string) => {
      setIsLoading(true);
      setError(null);
      const record = await getLibraryBook(bookId);
      if (!record) {
        setError('Could not find that saved document in local storage.');
        setIsLoading(false);
        refreshLibrary();
        return;
      }
      await loadPdfBytes(record.bytes, record.meta.name, {
        bookId: record.meta.id,
        startPage: record.meta.lastPage,
        presetId: record.meta.presetId,
        saveToLibrary: true,
      });
    },
    [loadPdfBytes, refreshLibrary]
  );

  const handleRemoveLibraryBook = useCallback(
    async (bookId: string) => {
      await removeBookFromLibrary(bookId);
      refreshLibrary();
    },
    [refreshLibrary]
  );

  const handleOpenSample = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const bytes = await generateSamplePdf();
      await loadPdfBytes(bytes, 'On-Paper-Light-and-Reading.pdf', { saveToLibrary: true });
    } catch (err) {
      console.error(err);
      setError('Could not generate the sample document.');
      setIsLoading(false);
    }
  }, [loadPdfBytes]);

  const handlePageVisible = useCallback(
    (pageNum: number) => {
      if (isResumingRef.current || viewMode === 'paged') return;
      setCurrentPage(pageNum);
      if (activeBookId) {
        updateBookProgress(activeBookId, { lastPage: pageNum });
      }
    },
    [activeBookId, viewMode]
  );

  const handleSelectPreset = useCallback(
    (id: PresetId) => {
      const p = PAPER_PRESETS[id];
      setSettings((prev) => ({
        ...prev,
        presetId: id,
        grain: p.defaultGrain,
        inkSoftness: p.defaultSoftness,
        showOriginal: false,
      }));
      if (activeBookId) {
        updateBookProgress(activeBookId, { presetId: id });
      }
    },
    [activeBookId]
  );

  const handleUpdateSettings = useCallback((patch: Partial<TransformSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleGoHome = useCallback(() => {
    exitFullscreen();
    originalTaskRef.current?.destroy().catch(() => {});
    originalTaskRef.current = null;
    vectorTaskRef.current?.destroy().catch(() => {});
    vectorTaskRef.current = null;
    setOriginalPdfDoc(null);
    setVectorPdfDoc(null);
    setOriginalBytes(null);
    setActiveBookId(null);
    setFileName('');
    setExportOpen(false);
    setError(null);
    refreshLibrary();
  }, [exitFullscreen, refreshLibrary]);

  // Keyboard shortcuts when reading a PDF
  useEffect(() => {
    if (!originalPdfDoc) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'Escape') {
        if (exportOpen) setExportOpen(false);
        else if (focusMode) exitFullscreen();
        return;
      }

      if (exportOpen) return;

      if (e.key >= '1' && e.key <= String(PRESET_LIST.length)) {
        const preset = PRESET_LIST[Number(e.key) - 1];
        if (preset) handleSelectPreset(preset.id);
      } else if (e.key.toLowerCase() === 'o') {
        setSettings((prev) => ({ ...prev, showOriginal: !prev.showOriginal }));
      } else if (e.key.toLowerCase() === 'f') {
        if (focusMode) exitFullscreen();
        else enterFullscreen();
      } else if (e.key.toLowerCase() === 'v') {
        handleToggleViewMode();
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(MAX_SCALE, +(s + 0.15).toFixed(2)));
      } else if (e.key === '-') {
        setScale((s) => Math.max(MIN_SCALE, +(s - 0.15).toFixed(2)));
      } else if (viewMode === 'paged' && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (viewMode === 'paged' && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        e.preventDefault();
        goToPage(currentPage - 1);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    originalPdfDoc,
    exportOpen,
    focusMode,
    viewMode,
    currentPage,
    handleSelectPreset,
    handleToggleViewMode,
    goToPage,
    enterFullscreen,
    exitFullscreen,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = 'dark';
    root.style.setProperty(
      '--desk',
      settings.presetId === 'oled-black' ? '#000000' : '#090909'
    );
  }, [settings.presetId]);

  const pageNumbers = useMemo(() => {
    if (!activePdfDoc) return [];
    if (viewMode === 'paged') return [currentPage];
    return Array.from({ length: activePdfDoc.numPages }, (_, i) => i + 1);
  }, [activePdfDoc, viewMode, currentPage]);

  function handleTouchStart(e: React.TouchEvent) {
    if (viewMode !== 'paged' || e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (viewMode !== 'paged' || !touchStartRef.current || e.changedTouches.length !== 1) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const elapsed = Date.now() - start.time;

    if (elapsed < 600 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) goToPage(currentPage + 1);
      else goToPage(currentPage - 1);
    }
  }

  return (
    <div
      className="vellum-app"
      onDragOver={(e) => {
        if (activePdfDoc) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!activePdfDoc) return;
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileSelected(file);
      }}
    >
      {!activePdfDoc ? (
        <LandingView
          activePreset={settings.presetId}
          libraryBooks={libraryBooks}
          onSelectPreset={handleSelectPreset}
          onFileSelected={handleFileSelected}
          onOpenLibraryBook={handleOpenLibraryBook}
          onRemoveLibraryBook={handleRemoveLibraryBook}
          onOpenSample={handleOpenSample}
          isLoading={isLoading}
          error={error}
        />
      ) : (
        <>
          {!focusMode && (
            <ReaderToolbar
              fileName={fileName}
              currentPage={currentPage}
              totalPages={activePdfDoc.numPages}
              scale={scale}
              viewMode={viewMode}
              settings={settings}
              onSelectPreset={handleSelectPreset}
              onUpdateSettings={handleUpdateSettings}
              onZoomChange={(next) => setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)))}
              onFitWidth={() => setScale(computeFitScale(basePageWidth))}
              onJumpToPage={goToPage}
              onToggleViewMode={handleToggleViewMode}
              onToggleFocus={enterFullscreen}
              onOpenExport={() => setExportOpen(true)}
              onOpenFile={handleFileSelected}
              onGoHome={handleGoHome}
            />
          )}

          {focusMode && (
            <div className="focus-floating-bar" role="toolbar" aria-label="Full screen controls">
              <button
                type="button"
                className="focus-bar-btn"
                onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - 0.15).toFixed(2)))}
                title="Zoom out (-)"
                aria-label="Zoom out"
              >
                <ZoomOut size={15} />
              </button>
              <button
                type="button"
                className="focus-bar-zoom"
                onClick={() => setScale(computeFitScale(basePageWidth))}
                title="Reset to Fit Width"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                className="focus-bar-btn"
                onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + 0.15).toFixed(2)))}
                title="Zoom in (+)"
                aria-label="Zoom in"
              >
                <ZoomIn size={15} />
              </button>
              <span className="focus-bar-divider" aria-hidden="true" />
              <button
                type="button"
                className="focus-bar-exit"
                onClick={exitFullscreen}
                title="Exit Full Screen (Esc or F)"
              >
                <Minimize2 size={15} aria-hidden="true" />
                <span>Exit</span>
              </button>
            </div>
          )}

          {settings.showOriginal && !focusMode && (
            <div className="compare-banner" role="status">
              Viewing <strong>Original White PDF</strong>. Press <kbd>O</kbd> or pick a reading
              mode to restore comfort view.
            </div>
          )}

          <main
            className={`reader-canvas ${focusMode ? 'reader-canvas--focus' : ''} ${
              viewMode === 'paged' ? 'reader-canvas--paged' : ''
            }`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {pageNumbers.map((pageNum) => (
              <PdfPageCanvas
                key={`${activeBookId ?? fileName}-${pageNum}`}
                pdfDoc={activePdfDoc}
                pageNumber={pageNum}
                initialPage={viewMode === 'paged' ? currentPage : resumePage}
                scale={scale}
                settings={settings}
                isVectorRecolored={usingVectorDoc}
                onVisible={handlePageVisible}
              />
            ))}
          </main>

          {viewMode === 'paged' && (
            <nav className="paged-nav-bar" aria-label="Page navigation">
              <button
                type="button"
                className="paged-nav-btn"
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
                <span>Prev</span>
              </button>
              <span className="paged-nav-status">
                Page {currentPage} of {activePdfDoc.numPages}
              </span>
              <button
                type="button"
                className="paged-nav-btn"
                disabled={currentPage >= activePdfDoc.numPages}
                onClick={() => goToPage(currentPage + 1)}
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight size={18} />
              </button>
            </nav>
          )}

          {exportOpen && originalPdfDoc && (
            <ExportModal
              pdfDoc={originalPdfDoc}
              originalBytes={originalBytes}
              fileName={fileName}
              settings={settings}
              onClose={() => setExportOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
