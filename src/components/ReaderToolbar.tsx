import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Maximize2,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PRESET_LIST, type PresetId, type TransformSettings } from '../lib/presets';

interface ReaderToolbarProps {
  fileName: string;
  currentPage: number;
  totalPages: number;
  scale: number;
  settings: TransformSettings;
  onSelectPreset: (id: PresetId) => void;
  onUpdateSettings: (patch: Partial<TransformSettings>) => void;
  onZoomChange: (nextScale: number) => void;
  onToggleFocus: () => void;
  onOpenExport: () => void;
  onOpenFile: (file: File) => void;
  onGoHome: () => void;
}

export function ReaderToolbar({
  fileName,
  currentPage,
  totalPages,
  scale,
  settings,
  onSelectPreset,
  onUpdateSettings,
  onZoomChange,
  onToggleFocus,
  onOpenExport,
  onOpenFile,
  onGoHome,
}: ReaderToolbarProps) {
  const [tuneOpen, setTuneOpen] = useState(false);
  const tuneRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!tuneOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (tuneRef.current && !tuneRef.current.contains(e.target as Node)) {
        setTuneOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tuneOpen]);

  return (
    <header className="reader-toolbar">
      <div className="toolbar-group toolbar-group--left">
        <button
          type="button"
          className="brand-btn"
          onClick={onGoHome}
          title="Back to Vellum home"
        >
          <BookOpen size={17} aria-hidden="true" />
          <span className="brand-name">Vellum</span>
        </button>

        <div className="doc-meta" title={fileName}>
          <span className="doc-title">{fileName}</span>
          <span className="doc-pages">
            {currentPage} / {totalPages}
          </span>
        </div>
      </div>

      <nav className="toolbar-group toolbar-group--presets" aria-label="Paper presets">
        {PRESET_LIST.map((preset, idx) => {
          const active = !settings.showOriginal && settings.presetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={`preset-pill ${active ? 'preset-pill--active' : ''}`}
              onClick={() => onSelectPreset(preset.id)}
              title={`${preset.name} (Shortcut: ${idx + 1})`}
              aria-pressed={active}
            >
              <span
                className="preset-swatch"
                style={{
                  backgroundColor: preset.paperHex,
                  borderColor: preset.inkHex,
                }}
                aria-hidden="true"
              >
                <span
                  className="preset-swatch-ink"
                  style={{ backgroundColor: preset.inkHex }}
                />
              </span>
              <span className="preset-pill-label">{preset.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="toolbar-group toolbar-group--right">
        <div className="zoom-controls" aria-label="Zoom controls">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onZoomChange(Math.max(0.6, +(scale - 0.15).toFixed(2)))}
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="zoom-readout">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onZoomChange(Math.min(2.2, +(scale + 0.15).toFixed(2)))}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <button
          type="button"
          className={`icon-btn ${settings.showOriginal ? 'icon-btn--active' : ''}`}
          onClick={() => onUpdateSettings({ showOriginal: !settings.showOriginal })}
          title="Compare Original White PDF (Shortcut: O)"
          aria-pressed={settings.showOriginal}
          aria-label="Toggle original white PDF"
        >
          {settings.showOriginal ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>

        <div className="tune-anchor" ref={tuneRef}>
          <button
            type="button"
            className={`icon-btn ${tuneOpen ? 'icon-btn--active' : ''}`}
            onClick={() => setTuneOpen((v) => !v)}
            title="Fine-tune paper grain & ink softness"
            aria-expanded={tuneOpen}
            aria-label="Fine-tune paper settings"
          >
            <SlidersHorizontal size={16} />
          </button>

          {tuneOpen && (
            <div className="tune-popover" role="dialog" aria-label="Paper fine-tuning">
              <div className="tune-row">
                <div className="tune-label-row">
                  <label htmlFor="grain-slider">Paper Fiber Grain</label>
                  <span>{Math.round(settings.grain * 100)}%</span>
                </div>
                <input
                  id="grain-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.grain}
                  onChange={(e) => onUpdateSettings({ grain: parseFloat(e.target.value) })}
                />
              </div>

              <div className="tune-row">
                <div className="tune-label-row">
                  <label htmlFor="softness-slider">Ink Softness</label>
                  <span>{Math.round(settings.inkSoftness * 100)}%</span>
                </div>
                <input
                  id="softness-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.inkSoftness}
                  onChange={(e) =>
                    onUpdateSettings({ inkSoftness: parseFloat(e.target.value) })
                  }
                />
              </div>

              <label className="tune-checkbox">
                <input
                  type="checkbox"
                  checked={settings.preserveColors}
                  onChange={(e) =>
                    onUpdateSettings({ preserveColors: e.target.checked })
                  }
                />
                <span>Preserve chart & photo colors</span>
              </label>
            </div>
          )}
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={onToggleFocus}
          title="Full Screen Reading (Shortcut: F)"
          aria-label="Enter full screen mode"
        >
          <Maximize2 size={16} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onOpenFile(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Open another PDF"
          aria-label="Open another PDF"
        >
          <FolderOpen size={16} />
        </button>

        <button type="button" className="btn btn--primary btn--compact" onClick={onOpenExport}>
          <Download size={15} aria-hidden="true" />
          <span>Export PDF</span>
        </button>
      </div>
    </header>
  );
}
