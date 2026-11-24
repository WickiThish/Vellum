import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minimize2 } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { ExportModal } from './components/ExportModal';
import { LandingView } from './components/LandingView';
import { PdfPageCanvas } from './components/PdfPageCanvas';
import { ReaderToolbar } from './components/ReaderToolbar';
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
  const [fileName, setFileName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(computeInitialScale);
  const [settings, setSettings] = useState<TransformSettings>(DEFAULT_SETTINGS);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activePreset = PAPER_PRESETS[settings.presetId];

  const loadPdfBytes = useCallback(async (bytes: Uint8Array, name: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const doc = await loadingTask.promise;
      loadingTaskRef.current?.destroy().catch(() => {});
      loadingTaskRef.current = loadingTask;
      setPdfDoc(doc);
      setFileName(name);
      setCurrentPage(1);
      setFocusMode(false);
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error('Error loading PDF:', err);
      setError('Could not open that PDF. Please check that it is a valid, unencrypted PDF file.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFileSelected = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Please select a PDF (.pdf) file.');
        return;
      }
      const buffer = await file.arrayBuffer();
      await loadPdfBytes(new Uint8Array(buffer), file.name);
    },
    [loadPdfBytes]
  );

  const handleOpenSample = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const bytes = await generateSamplePdf();
      await loadPdfBytes(bytes, 'On-Paper-Light-and-Reading.pdf');
    } catch (err) {
      console.error(err);
      setError('Could not generate the sample document.');
      setIsLoading(false);
    }
  }, [loadPdfBytes]);

  const handleSelectPreset = useCallback((id: PresetId) => {
    const p = PAPER_PRESETS[id];
    setSettings((prev) => ({
      ...prev,
      presetId: id,
      grain: p.defaultGrain,
      inkSoftness: p.defaultSoftness,
      showOriginal: false,
    }));
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<TransformSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleGoHome = useCallback(() => {
    loadingTaskRef.current?.destroy().catch(() => {});
    loadingTaskRef.current = null;
    setPdfDoc(null);
    setFileName('');
    setFocusMode(false);
    setExportOpen(false);
    setError(null);
  }, []);

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
        else if (focusMode) setFocusMode(false);
        return;
      }

      if (exportOpen) return;

      if (e.key >= '1' && e.key <= String(PRESET_LIST.length)) {
        const preset = PRESET_LIST[Number(e.key) - 1];
        if (preset) handleSelectPreset(preset.id);
      } else if (e.key.toLowerCase() === 'o') {
        setSettings((prev) => ({ ...prev, showOriginal: !prev.showOriginal }));
      } else if (e.key.toLowerCase() === 'f') {
        setFocusMode((v) => !v);
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(2.2, +(s + 0.15).toFixed(2)));
      } else if (e.key === '-') {
        setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pdfDoc, exportOpen, focusMode, handleSelectPreset]);

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
          onSelectPreset={handleSelectPreset}
          onFileSelected={handleFileSelected}
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
              onToggleFocus={() => setFocusMode(true)}
              onOpenExport={() => setExportOpen(true)}
              onOpenFile={handleFileSelected}
              onGoHome={handleGoHome}
            />
          )}

          {focusMode && (
            <button
              type="button"
              className="focus-exit-pill"
              onClick={() => setFocusMode(false)}
              title="Exit Focus Mode (Esc or F)"
            >
              <Minimize2 size={15} aria-hidden="true" />
              <span>Exit Focus</span>
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
                key={`${fileName}-${pageNum}`}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                scale={scale}
                settings={settings}
                onVisible={setCurrentPage}
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
