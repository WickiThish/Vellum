import { useState } from 'react';
import { CheckCircle2, Download, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  exportTransformedPdf,
  triggerPdfDownload,
  type ExportProgress,
} from '../lib/pdfExporter';
import { PAPER_PRESETS, type TransformSettings } from '../lib/presets';
import { exportVectorPdf, type VectorExportProgress } from '../lib/vectorPdfExporter';

type ExportMode = 'vector' | 'image-standard' | 'image-high';

interface ExportModalProps {
  pdfDoc: PDFDocumentProxy;
  originalBytes: Uint8Array | null;
  fileName: string;
  settings: TransformSettings;
  onClose: () => void;
}

export function ExportModal({
  pdfDoc,
  originalBytes,
  fileName,
  settings,
  onClose,
}: ExportModalProps) {
  const [mode, setMode] = useState<ExportMode>(originalBytes ? 'vector' : 'image-standard');
  const [progress, setProgress] = useState<{
    currentPage: number;
    totalPages: number;
    label: string;
  } | null>(null);
  const [doneFileName, setDoneFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preset = PAPER_PRESETS[settings.presetId] ?? PAPER_PRESETS['true-dark'];
  const isExporting = progress !== null && !doneFileName;

  async function handleExport() {
    setError(null);
    setDoneFileName(null);
    setProgress({
      currentPage: 1,
      totalPages: pdfDoc.numPages,
      label: mode === 'vector' ? 'Recoloring vector page 1…' : 'Rendering page 1…',
    });

    try {
      if (mode === 'vector' && originalBytes) {
        const result = await exportVectorPdf(
          originalBytes,
          settings,
          fileName,
          (p: VectorExportProgress) =>
            setProgress({
              currentPage: p.currentPage,
              totalPages: p.totalPages,
              label:
                p.stage === 'saving'
                  ? 'Saving vector PDF…'
                  : `Recoloring page ${p.currentPage} of ${p.totalPages}…`,
            })
        );
        triggerPdfDownload(result.bytes, result.fileName);
        setDoneFileName(result.fileName);
      } else {
        const quality = mode === 'image-high' ? 'high' : 'standard';
        const result = await exportTransformedPdf(
          pdfDoc,
          settings,
          fileName,
          quality,
          (p: ExportProgress) =>
            setProgress({
              currentPage: p.currentPage,
              totalPages: p.totalPages,
              label:
                p.stage === 'saving'
                  ? 'Assembling PDF…'
                  : `Transforming page ${p.currentPage} of ${p.totalPages}…`,
            })
        );
        triggerPdfDownload(result.bytes, result.fileName);
        setDoneFileName(result.fileName);
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? `${err.message} Try Visual Snapshot mode if this PDF uses unsupported compression.`
          : 'Could not export PDF.'
      );
      setProgress(null);
    }
  }

  const pct = progress
    ? Math.round((progress.currentPage / Math.max(1, progress.totalPages)) * 100)
    : 0;

  return (
    <div className="modal-backdrop" role="presentation" onClick={isExporting ? undefined : onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="export-modal-title">Export Transformed PDF</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Close export dialog"
          >
            <X size={17} />
          </button>
        </div>

        <p className="modal-desc">
          Save <strong>{preset.name}</strong> ({pdfDoc.numPages}{' '}
          {pdfDoc.numPages === 1 ? 'page' : 'pages'}) as a standalone PDF you can read and annotate
          on any tablet, laptop, or e-reader.
        </p>

        <div className="export-summary">
          <span
            className="preset-swatch preset-swatch--lg"
            style={{ backgroundColor: preset.paperHex, borderColor: preset.inkHex }}
          >
            <span className="preset-swatch-ink" style={{ backgroundColor: preset.inkHex }} />
          </span>
          <div>
            <div className="export-summary-title">{preset.name}</div>
            <div className="export-summary-sub">
              {preset.paperHex} background · {preset.inkHex} ink ·{' '}
              {settings.preserveColors ? 'Colors & photos preserved' : 'Monochrome ink'}
            </div>
          </div>
        </div>

        <fieldset className="quality-fieldset" disabled={isExporting}>
          <legend className="section-label">Export Format</legend>
          <div className="quality-options">
            {originalBytes && (
              <label className="quality-option">
                <input
                  type="radio"
                  name="export-mode"
                  value="vector"
                  checked={mode === 'vector'}
                  onChange={() => setMode('vector')}
                />
                <div>
                  <div className="quality-title">True Vector PDF (Recommended)</div>
                  <div className="quality-sub">
                    Selectable & searchable text, infinite zoom sharpness, tiny file size, instant
                    export
                  </div>
                </div>
              </label>
            )}
            <label className="quality-option">
              <input
                type="radio"
                name="export-mode"
                value="image-standard"
                checked={mode === 'image-standard'}
                onChange={() => setMode('image-standard')}
              />
              <div>
                <div className="quality-title">Visual Snapshot (Balanced)</div>
                <div className="quality-sub">
                  Best for scanned books or slides where vector recoloring looks uneven
                </div>
              </div>
            </label>
            <label className="quality-option">
              <input
                type="radio"
                name="export-mode"
                value="image-high"
                checked={mode === 'image-high'}
                onChange={() => setMode('image-high')}
              />
              <div>
                <div className="quality-title">Visual Snapshot (High Detail, 2.25×)</div>
                <div className="quality-sub">
                  Maximum image sharpness for scanned dense equations & diagrams
                </div>
              </div>
            </label>
          </div>
        </fieldset>

        {isExporting && progress && (
          <div className="export-progress" aria-live="polite">
            <div className="export-progress-row">
              <span>{progress.label}</span>
              <span>{pct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {doneFileName && (
          <div className="export-success" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>
              Saved <strong>{doneFileName}</strong>
            </span>
          </div>
        )}

        {error && (
          <p className="dropzone-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={isExporting}
          >
            {doneFileName ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download size={16} aria-hidden="true" />
            {isExporting ? 'Exporting…' : doneFileName ? 'Download Again' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
