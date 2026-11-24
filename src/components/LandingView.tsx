import { useRef, useState } from 'react';
import { BookOpen, FileUp, ShieldCheck, Sparkles } from 'lucide-react';
import { PRESET_LIST, type PresetId } from '../lib/presets';

interface LandingViewProps {
  activePreset: PresetId;
  onSelectPreset: (id: PresetId) => void;
  onFileSelected: (file: File) => void;
  onOpenSample: () => void;
  isLoading: boolean;
  error: string | null;
}

export function LandingView({
  activePreset,
  onSelectPreset,
  onFileSelected,
  onOpenSample,
  isLoading,
  error,
}: LandingViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  }

  return (
    <main className="landing-root">
      <div className="landing-container">
        <header className="landing-header">
          <div className="brand-pill">
            <BookOpen size={16} aria-hidden="true" />
            <span>Vellum</span>
          </div>
          <h1 className="landing-title">
            Read PDFs on warm paper,
            <br />
            not blinding white screens.
          </h1>
          <p className="landing-subtitle">
            Transform stark white backgrounds into tactile Kraft brown paper, warm parchment, soft
            sepia, or dim slate — softening harsh black text into deep charcoal and espresso ink.
            Read live or export a new PDF.
          </p>
        </header>

        <section
          className={`dropzone ${isDragging ? 'dropzone--active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
              e.target.value = '';
            }}
          />

          <div className="dropzone-icon" aria-hidden="true">
            <FileUp size={28} />
          </div>

          <h2 className="dropzone-heading">
            {isLoading ? 'Preparing your document…' : 'Drop a PDF here to begin'}
          </h2>
          <p className="dropzone-hint">
            Works with textbooks, research papers, essays, and manuals of any length.
          </p>

          <div className="dropzone-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={isLoading}
              onClick={() => inputRef.current?.click()}
            >
              <FileUp size={17} aria-hidden="true" />
              Choose PDF File
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={isLoading}
              onClick={onOpenSample}
            >
              <Sparkles size={17} aria-hidden="true" />
              Try Sample Document
            </button>
          </div>

          {error && (
            <p className="dropzone-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="preset-showcase" aria-labelledby="presets-heading">
          <div className="preset-showcase-header">
            <h2 id="presets-heading" className="section-label">
              Choose your paper stock
            </h2>
            <span className="section-hint">Click any stock to preview the workspace tone</span>
          </div>

          <div className="preset-grid" role="radiogroup" aria-label="Paper presets">
            {PRESET_LIST.map((preset) => {
              const selected = preset.id === activePreset;
              return (
                <label key={preset.id} className="preset-card">
                  <input
                    type="radio"
                    name="landing-preset"
                    value={preset.id}
                    checked={selected}
                    onChange={() => onSelectPreset(preset.id)}
                    className="sr-only"
                  />
                  <div
                    className="preset-mini-sheet"
                    style={{
                      backgroundColor: preset.paperHex,
                      color: preset.inkHex,
                      borderColor: preset.borderHex,
                    }}
                    aria-hidden="true"
                  >
                    <span className="mini-sheet-title">Aa</span>
                    <span
                      className="mini-sheet-line"
                      style={{ backgroundColor: preset.inkHex, opacity: 0.72 }}
                    />
                    <span
                      className="mini-sheet-line mini-sheet-line--short"
                      style={{ backgroundColor: preset.inkHex, opacity: 0.45 }}
                    />
                  </div>
                  <div className="preset-card-meta">
                    <span className="preset-card-name">{preset.name}</span>
                    <span className="preset-card-tagline">{preset.tagline}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <footer className="landing-footer">
          <div className="privacy-badge">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>100% local in your browser · Your PDFs never leave this device</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
