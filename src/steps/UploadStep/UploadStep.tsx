import { useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent, type Ref } from 'react';
import { HeroArt, WizardFrame } from '../../components/shell';
import { Disclosure, Notice, Tile } from '../../components/ui';
import { APP_NAME, EXPECT_ITEMS, EXPORT_STEPS, HERO_FEATURES, HINTS, REASSURANCE, STATUS, type HeroFeature } from '../../ui/copy';
import { LOGO_DATA_URI } from '../../ui/assets';
import { isCartridgeFilename } from '../../ui/format';
import './UploadStep.css';

export interface UploadStepProps {
  /** Called with a file that looks like a course export (.imscc or .zip). */
  onFile: (file: File) => void;
  /** True while the export is being read; the sheet shows a spinner and the tiles go inert. */
  busy: boolean;
  /** Current status line, e.g. "Reading your course export…" or "Found 33 pages in 9 modules." */
  status?: string;
  /** Read error from the app. Shown as an alert; the user can dismiss it. */
  error?: string;
  /** Receives the step heading so the app can move focus to it on arrival. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Shown when a dropped or chosen file is not a course export. */
export const WRONG_FILE_MESSAGE = 'That file is not a course export. Choose an .imscc or .zip file.';
export const KICKER = 'Print-ready in four steps';
export const DROP_TITLE = 'Drop your course export here';
export const DROP_AREA_NAME = 'Course export drop area';

const DROP_HINT_ID = 'upload-drop-hint';
const ERROR_ID = 'upload-error';

/** Name of the tile section for the outline only (visually hidden): the tiles carry no visible heading (§10). */
export const HIGHLIGHTS_TITLE = 'Highlights';

/** Bootstrap Icons per feature; decorative, always beside the title. */
const FEATURE_ICONS: Record<HeroFeature['id'], string> = {
  easy: 'bi-hand-index-thumb',
  access: 'bi-universal-access',
  local: 'bi-shield-lock',
  themes: 'bi-palette',
};

/**
 * A static mock of a syllabus cover (§10 "the hero"): the college mark on a
 * navy band, a paper title block with placeholder text set like the real
 * cover's title (bold sans, never the display serif), two grey text lines.
 * Rendered in the navy hero band's aside (right of the title from 992 px).
 * Pure CSS plus the inlined logo, so nothing is fetched. Decorative:
 * hidden from assistive technology as a whole, and hidden below 992 px by
 * the stylesheet. Nothing here is a real course, name, or code.
 */
function CoverCard() {
  return (
    <div className="hero-cover" aria-hidden="true">
      <div className="hero-cover-band">
        <span className="hero-cover-plate">
          <img src={LOGO_DATA_URI} alt="" className="hero-cover-logo" width={83} height={22} decoding="async" />
        </span>
      </div>
      <div className="hero-cover-block">
        <span className="hero-cover-title">Course title</span>
        <span className="hero-cover-name">Instructor name</span>
      </div>
      <div className="hero-cover-lines">
        <span className="hero-cover-line" />
        <span className="hero-cover-line is-short" />
      </div>
    </div>
  );
}

/**
 * Step 1 — Upload (DESIGN.md §10 "Step 1 — Upload (the hero)").
 *
 * The app name large in the display serif, the one-line promise, and a
 * drop target drawn as a dashed sheet of paper on the desk. The sheet is a
 * named, non-focusable group: drop and a tap on the blank paper are pointer
 * enhancements, and the keyboard path is the real "Choose a file" tile
 * (56 px) inside it, which drives a hidden file input. Errors are a Notice
 * with role="alert". Below, in small type,
 * the two disclosures from §14. No JavaScript reaches the document.
 */
export default function UploadStep({ onFile, busy, status, error, headingRef }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const appError = error && error !== dismissedError ? error : null;
  const shownError = localError ?? appError;
  const statusLine = status && status !== error ? status : null;

  const openPicker = (): void => {
    if (busy) return;
    inputRef.current?.click();
  };

  const accept = (file: File | undefined): void => {
    if (busy || !file) return;
    if (!isCartridgeFilename(file.name)) {
      setLocalError(WRONG_FILE_MESSAGE);
      return;
    }
    setLocalError(null);
    setDismissedError(null);
    onFile(file);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
    accept(e.target.files?.[0]);
    e.target.value = '';
  };

  const onDismiss = (): void => {
    if (localError) setLocalError(null);
    else if (appError) setDismissedError(appError);
  };

  // Pointer enhancement: a tap on the blank paper opens the picker too.
  const onSheetClick = (e: MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a')) return;
    openPicker();
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    dragDepth.current += 1;
    if (!busy) setDragging(true);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  };
  const onDragLeave = (): void => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  const sheetClass = ['hero-drop', 'sg-sheet', 'sg-sheet-dashed', dragging ? 'is-dragging' : '', busy ? 'is-busy' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="hero-step">
      <WizardFrame step={1} title={APP_NAME} kicker={KICKER} intro={REASSURANCE} band={<CoverCard />} className="hero" headingRef={headingRef}>
        <div
          className={sheetClass}
          role="group"
          aria-label={DROP_AREA_NAME}
          aria-describedby={DROP_HINT_ID}
          aria-busy={busy || undefined}
          onClick={onSheetClick}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <HeroArt />
          {busy ? (
            <p className="hero-status">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
              {status || STATUS.reading}
            </p>
          ) : (
            <>
              <p className="hero-drop-title">{DROP_TITLE}</p>
              <p className="hero-drop-or">or</p>
            </>
          )}
          <div className="hero-actions">
            <Tile variant="primary" size="lg" icon="bi-folder2-open" aria-disabled={busy || undefined} onClick={openPicker}>
              Choose a file
            </Tile>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".imscc,.zip"
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={onChange}
          />
          <p id={DROP_HINT_ID} className="sg-hint">
            {HINTS.fileTypes}
          </p>
          {!busy && statusLine && <p className="hero-status">{statusLine}</p>}
        </div>

        {shownError && (
          <Notice tone="error" id={ERROR_ID} className="hero-notice" onDismiss={onDismiss} dismissLabel="Dismiss error">
            {shownError}
          </Notice>
        )}

        <div className="hero-fineprint">
          <Disclosure id="upload-how-to-export" label="How to export from Canvas">
            <ol>
              {EXPORT_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Disclosure>
          <Disclosure id="upload-what-to-expect" label="What to expect">
            <ol>
              {EXPECT_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </Disclosure>
        </div>

        {/* Highlights: four paper tiles, no visible heading (the h3 exists for the outline only).
            Not controls: no widget role, no tab stop. role="list" is explicit because WebKit
            drops list semantics from an unmarked list styled list-style: none. */}
        <section className="hero-band hero-highlights" aria-labelledby="hero-highlights-title">
          <h3 id="hero-highlights-title" className="visually-hidden">
            {HIGHLIGHTS_TITLE}
          </h3>
          <ul className="hero-features" role="list">
            {HERO_FEATURES.map((f) => (
              <li key={f.id} className="hero-feature">
                <span className="hero-feature-icon" aria-hidden="true">
                  <i className={`bi ${FEATURE_ICONS[f.id]}`} />
                </span>
                <h4 className="hero-feature-title">{f.title}</h4>
                <p className="hero-feature-text">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </WizardFrame>
    </div>
  );
}
