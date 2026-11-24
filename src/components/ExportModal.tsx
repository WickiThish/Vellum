import { useState } from 'react';
import { CheckCircle2, Download, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  exportTransformedPdf,
  triggerPdfDownload,
  type ExportProgress,
  type ExportQuality,
} from '../lib/pdfExporter';
import { PAPER_PRESETS, type TransformSettings } from '../lib/presets';

interface ExportModalProps {
  pdfDoc: PDFDocumentProxy;
  fileName: string;
  settings: TransformSettings;
  onClose: () => void;
}

export function ExportModal({ pdfDoc, fileName, settings, onClose }: ExportModalProps) {
  const [quality, setQuality] = useState<ExportQuality>('standard');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [doneFileName, setDoneFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preset = PAPER_PRESETS[settings.presetId];
  const isExporting = progress !== null && !doneFileName;

  async function handleExport() {
    setError(null);
    setDoneFileName(null);
    setProgress({ currentPage: 1, totalPages: pdfDoc.numPages, stage: 'rendering' });

    try {
      const result = await exportTransformedPdf(
        pdfDoc,
        settings,
        fileName,
        quality,
        (p) => setProgress(p)
      );
      triggerPdfDownload(result.bytes, result.fileName);
      setDoneFileName(result.fileName);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not export PDF.');
      setProgress(null);
    }
  }

  const pct = progress
    ? progress.stage === 'saving'
      ? 100
      : Math.round((progress.currentPage / progress.totalPages) * 100)
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
          Bakes <strong>{preset.name}</strong> ({pdfDoc.numPages}{' '}
          {pdfDoc.numPages === 1 ? 'page' : 'pages'}) into a standalone PDF you can read on any
          tablet, laptop, or e-reader.
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
              Grain {Math.round(settings.grain * 100)}% · Ink softness{' '}
              {Math.round(settings.inkSoftness * 100)}% ·{' '}
              {settings.preserveColors ? 'Colors preserved' : 'Monochrome ink'}
            </div>
          </div>
        </div>

        <fieldset className="quality-fieldset" disabled={isExporting}>
          <legend className="section-label">Export Resolution</legend>
          <div className="quality-options">
            <label className="quality-option">
              <input
                type="radio"
                name="export-quality"
                value="standard"
                checked={quality === 'standard'}
                onChange={() => setQuality('standard')}
              />
              <div>
                <div className="quality-title">Balanced (Recommended)</div>
                <div className="quality-sub">Crisp reading quality, smaller file size</div>
              </div>
            </label>
            <label className="quality-option">
              <input
                type="radio"
                name="export-quality"
                value="high"
                checked={quality === 'high'}
                onChange={() => setQuality('high')}
              />
              <div>
                <div className="quality-title">High Detail (2×)</div>
                <div className="quality-sub">Best for dense equations & fine diagrams</div>
              </div>
            </label>
          </div>
        </fieldset>

        {isExporting && progress && (
          <div className="export-progress" aria-live="polite">
            <div className="export-progress-row">
              <span>
                {progress.stage === 'saving'
                  ? 'Assembling PDF…'
                  : `Transforming page ${progress.currentPage} of ${progress.totalPages}…`}
              </span>
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
