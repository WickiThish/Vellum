import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minimize2 } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { ExportModal } from './components/ExportModal';
import { LandingView } from './components/LandingView';
import { PdfPageCanvas } from './components/PdfPageCanvas';
import { ReaderToolbar } from './components/ReaderToolbar';
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
  type PresetId,
  type TransformSettings,
} from './lib/presets';
import { generateSamplePdf } from './lib/samplePdf';

function computeInitialScale(): number {
  if (typeof window === 'undefined') return 1.15;
  const available = Math.min(window.innerWidth - 48, 860);
  const fit = available / 612;
  return Math.max(0.65, Math.min(1.3, +fit.toFixed(2)));
}

export default function App() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [resumePage, setResumePage] = useState<number>(1);
  const [scale, setScale] = useState<number>(computeInitialScale);
  const [settings, setSettings] = useState<TransformSettings>(DEFAULT_SETTINGS);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryBooks, setLibraryBooks] = useState<LibraryBookMeta[]>([]);

  // Avoid overwriting saved lastPage while we're scrolling to the resumed page
  const isResumingRef = useRef<boolean>(false);

  const activePreset = PAPER_PRESETS[settings.presetId];

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

  const enterFullscreen = useCallback(() => {
    setFocusMode(true);
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        // Fallback: stay in toolbar-hidden focus mode if browser blocks fullscreen
      });
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    setFocusMode(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Keep focusMode synced when user exits native browser fullscreen via Esc or browser UI
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

  const loadPdfBytes = useCallback(
    async (
      bytes: Uint8Array,
      name: string,
      options?: { bookId?: string; startPage?: number; presetId?: PresetId; saveToLibrary?: boolean }
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        // Clone bytes because PDF.js may transfer the underlying ArrayBuffer to its worker
        const workerBytes = bytes.slice();
        const loadingTask = pdfjsLib.getDocument({ data: workerBytes });
        const doc = await loadingTask.promise;

        loadingTaskRef.current?.destroy().catch(() => {});
        loadingTaskRef.current = loadingTask;

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
          const p = PAPER_PRESETS[options.presetId];
          setSettings((prev) => ({
            ...prev,
            presetId: options.presetId!,
            grain: p.defaultGrain,
            inkSoftness: p.defaultSoftness,
            showOriginal: false,
          }));
        }

        setActiveBookId(bookId);
        setFileName(name);
        setResumePage(targetPage);
        setCurrentPage(targetPage);
        setPdfDoc(doc);
        setFocusMode(false);
        scrollToPage(targetPage);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Could not open that PDF. Please check that it is a valid, unencrypted PDF file.');
      } finally {
        setIsLoading(false);
      }
    },
    [refreshLibrary, scrollToPage, settings.presetId]
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
      if (isResumingRef.current) return;
      setCurrentPage(pageNum);
      if (activeBookId) {
        updateBookProgress(activeBookId, { lastPage: pageNum });
      }
    },
    [activeBookId]
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
    loadingTaskRef.current?.destroy().catch(() => {});
    loadingTaskRef.current = null;
    setPdfDoc(null);
    setActiveBookId(null);
    setFileName('');
    setExportOpen(false);
    setError(null);
    refreshLibrary();
  }, [exitFullscreen, refreshLibrary]);

  // Keyboard shortcuts when reading a PDF
  useEffect(() => {
    if (!pdfDoc) return;

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
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(2.2, +(s + 0.15).toFixed(2)));
      } else if (e.key === '-') {
        setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pdfDoc, exportOpen, focusMode, handleSelectPreset, enterFullscreen, exitFullscreen]);

  // Apply active theme tokens to the document root so scrollbars, selection, and chrome match
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--desk', activePreset.deskHex);
    root.style.setProperty('--surface', activePreset.surfaceHex);
    root.style.setProperty('--paper', activePreset.paperHex);
    root.style.setProperty('--ink', activePreset.inkHex);
    root.style.setProperty('--muted', activePreset.mutedInkHex);
    root.style.setProperty('--border', activePreset.borderHex);
    root.style.setProperty('--accent', activePreset.accentHex);
    root.style.setProperty('--accent-ink', activePreset.accentInkHex);
    root.style.colorScheme = activePreset.isDark ? 'dark' : 'light';

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', activePreset.surfaceHex);
    }
  }, [activePreset]);

  const pageNumbers = useMemo(() => {
    if (!pdfDoc) return [];
    return Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);
  }, [pdfDoc]);

  return (
    <div
      className="vellum-app"
      onDragOver={(e) => {
        if (pdfDoc) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!pdfDoc) return;
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileSelected(file);
      }}
    >
      {!pdfDoc ? (
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
              totalPages={pdfDoc.numPages}
              scale={scale}
              settings={settings}
              onSelectPreset={handleSelectPreset}
              onUpdateSettings={handleUpdateSettings}
              onZoomChange={setScale}
              onToggleFocus={enterFullscreen}
              onOpenExport={() => setExportOpen(true)}
              onOpenFile={handleFileSelected}
              onGoHome={handleGoHome}
            />
          )}

          {focusMode && (
            <button
              type="button"
              className="focus-exit-pill"
              onClick={exitFullscreen}
              title="Exit Full Screen (Esc or F)"
            >
              <Minimize2 size={15} aria-hidden="true" />
              <span>Exit Full Screen</span>
            </button>
          )}

          {settings.showOriginal && !focusMode && (
            <div className="compare-banner" role="status">
              Viewing <strong>Original White PDF</strong> — press <kbd>O</kbd> or pick a paper
              stock to restore comfort mode.
            </div>
          )}

          <main className={`reader-canvas ${focusMode ? 'reader-canvas--focus' : ''}`}>
            {pageNumbers.map((pageNum) => (
              <PdfPageCanvas
                key={`${activeBookId ?? fileName}-${pageNum}`}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                initialPage={resumePage}
                scale={scale}
                settings={settings}
                onVisible={handlePageVisible}
              />
            ))}
          </main>

          {exportOpen && (
            <ExportModal
              pdfDoc={pdfDoc}
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
