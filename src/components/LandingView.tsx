import { useRef, useState } from 'react';
import { BookOpen, Clock, FileUp, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import type { LibraryBookMeta } from '../lib/libraryDb';
import { PAPER_PRESETS, PRESET_LIST, type PresetId } from '../lib/presets';

interface LandingViewProps {
  activePreset: PresetId;
  libraryBooks: LibraryBookMeta[];
  onSelectPreset: (id: PresetId) => void;
  onFileSelected: (file: File) => void;
  onOpenLibraryBook: (bookId: string) => void;
  onRemoveLibraryBook: (bookId: string) => void;
  onOpenSample: () => void;
  isLoading: boolean;
  error: string | null;
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  return `${diffDay}d ago`;
}

export function LandingView({
  activePreset,
  libraryBooks,
  onSelectPreset,
  onFileSelected,
  onOpenLibraryBook,
  onRemoveLibraryBook,
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
            Read PDFs comfortably for hours,
            <br />
            without harsh white glare.
          </h1>
          <p className="landing-subtitle">
            Transform stark white PDFs into crystal-clear True Dark, anti-halation Soft Graphite,
            matte E-Ink Grey, or calm Soft Sage — keeping embedded photos un-inverted and layouts
            100% intact. Read live or export a new PDF.
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

        {libraryBooks.length > 0 && (
          <section className="library-section" aria-labelledby="library-heading">
            <div className="preset-showcase-header">
              <h2 id="library-heading" className="section-label">
                Your Library · Continue Reading
              </h2>
              <span className="section-hint">
                Saved locally in this browser — resumes right where you left off
              </span>
            </div>

            <div className="library-grid">
              {libraryBooks.map((book) => {
                const bookPreset = PAPER_PRESETS[book.presetId] ?? PAPER_PRESETS['true-dark'];
                const displayTitle = book.name.replace(/\.pdf$/i, '');
                const progressPct = Math.min(
                  100,
                  Math.max(1, Math.round((book.lastPage / Math.max(1, book.totalPages)) * 100))
                );

                return (
                  <div key={book.id} className="library-card">
                    <button
                      type="button"
                      className="library-card-main"
                      disabled={isLoading}
                      onClick={() => onOpenLibraryBook(book.id)}
                    >
                      <span
                        className="library-spine"
                        style={{
                          backgroundColor: bookPreset.paperHex,
                          borderColor: bookPreset.borderHex,
                          color: bookPreset.inkHex,
                        }}
                        aria-hidden="true"
                      >
                        Aa
                      </span>

                      <div className="library-card-body">
                        <div className="library-card-title" title={book.name}>
                          {displayTitle}
                        </div>
                        <div className="library-card-meta">
                          <span>
                            Page {book.lastPage} of {book.totalPages}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="library-time">
                            <Clock size={12} aria-hidden="true" />
                            {formatRelativeTime(book.lastOpenedAt)}
                          </span>
                        </div>
                        <div className="library-progress-track" aria-hidden="true">
                          <div
                            className="library-progress-fill"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="icon-btn library-delete-btn"
                      onClick={() => onRemoveLibraryBook(book.id)}
                      title={`Remove "${displayTitle}" from library`}
                      aria-label={`Remove ${displayTitle} from library`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="preset-showcase" aria-labelledby="presets-heading">
          <div className="preset-showcase-header">
            <h2 id="presets-heading" className="section-label">
              Reading modes
            </h2>
            <span className="section-hint">Select the default filter for your PDFs</span>
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
