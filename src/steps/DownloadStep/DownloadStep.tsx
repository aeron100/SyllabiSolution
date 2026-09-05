import { useCallback, useRef, useState, type MutableRefObject, type Ref } from 'react';
import type { AssembledDoc, NoticeCode } from '../../lib/types';
import { Notice, Tile, VisuallyHidden } from '../../components/ui';
import { WizardFrame } from '../../components/shell';
import { LARGE_FILE_BYTES, NOTICE_COPY, NOTICE_DOWNLOAD_FIRST, NOTICE_ORDER, STATUS, noticeLargeFile } from '../../ui/copy';
import { formatBytes, megabytes } from '../../ui/format';
import { A11yReport } from './A11yReport';
import './download.css';

export interface DownloadStepProps {
  /** The assembled document (no JavaScript inside). */
  doc: AssembledDoc;
  /** Suggested filename, e.g. "ics123-syllabus.html". */
  filename: string;
  /** Save the syllabus file. The app builds the Blob and disarms the leave-page guard. */
  onDownload: () => void;
  /** Save the plain-text accessibility report. */
  onDownloadReport: () => void;
  /**
   * Called after this step has asked the document frame to print, so the app
   * can decide whether to show the browser hint (`printHint`).
   */
  onPrint: () => void;
  /** Discard everything and return to Upload. */
  onStartOver: () => void;
  /** True once this document has been saved; shows "Saved. You can close this page." */
  downloaded: boolean;
  /** Contextual notices for this document (DESIGN.md §14); copy comes from src/ui/copy.ts. */
  notices: NoticeCode[];
  onDismissNotice: (code: NoticeCode) => void;
  /** One sentence shown by the Print tile, e.g. "For best results, print from Chrome or Edge." */
  printHint?: string;
  /** Reaches the sandboxed document frame (for example to focus it). */
  iframeRef?: Ref<HTMLIFrameElement>;
  /** When given, a Back tile returns to Arrange and style without losing anything. */
  onBack?: () => void;
  /** Focus target for the step heading whenever the step changes. */
  headingRef?: Ref<HTMLHeadingElement>;
}

interface ShownNotice {
  key: string;
  text: string;
  codes: NoticeCode[];
}

/** Local dismissals (large-file, download-first, print hint) reset when the document changes. */
interface LocalDismissed {
  doc: AssembledDoc;
  keys: readonly string[];
}

/**
 * Step 4 — Download (DESIGN.md §10). A compact bar of tiles, the contextual
 * notices, the finished document as a sheet of paper on the desk inside a
 * sandboxed iframe (no scripts), and the accessibility report as disclosures.
 * Download sits first in the bar so it is in the same place every time.
 * The notices here are static (no live role); "Saved" and "Report saved" are
 * announced by the app's one live region when the download happens.
 */
export default function DownloadStep({
  doc,
  filename,
  onDownload,
  onDownloadReport,
  onPrint,
  onStartOver,
  downloaded,
  notices,
  onDismissNotice,
  printHint,
  iframeRef,
  onBack,
  headingRef,
}: DownloadStepProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [local, setLocal] = useState<LocalDismissed>({ doc, keys: [] });
  const localKeys = local.doc === doc ? local.keys : [];

  const dismissLocal = useCallback(
    (key: string) => setLocal((prev) => ({ doc, keys: prev.doc === doc ? [...prev.keys, key] : [key] })),
    [doc],
  );

  const setFrame = useCallback(
    (el: HTMLIFrameElement | null) => {
      frameRef.current = el;
      if (typeof iframeRef === 'function') iframeRef(el);
      else if (iframeRef) (iframeRef as MutableRefObject<HTMLIFrameElement | null>).current = el;
    },
    [iframeRef],
  );

  const print = (): void => {
    // A new print attempt brings the browser hint back if it was dismissed.
    setLocal((prev) => (prev.doc === doc ? { doc, keys: prev.keys.filter((k) => k !== 'print-hint') } : { doc, keys: [] }));
    const win = frameRef.current?.contentWindow;
    try {
      if (win) {
        win.focus();
        win.print();
      } else {
        window.print();
      }
    } catch {
      try {
        window.print();
      } catch {
        /* printing is not available here */
      }
    }
    onPrint();
  };

  // §14 contextual notices, in display order, one per distinct sentence
  // (external-images and missing-files share the same copy).
  const shown: ShownNotice[] = [];
  for (const code of NOTICE_ORDER) {
    if (!notices.includes(code)) continue;
    const text = NOTICE_COPY[code];
    const existing = shown.find((n) => n.text === text);
    if (existing) existing.codes.push(code);
    else shown.push({ key: code, text, codes: [code] });
  }
  const isLarge = doc.bytes > LARGE_FILE_BYTES;
  const showLarge = isLarge && !localKeys.includes('large-file');
  const showDownloadFirst = !downloaded && !localKeys.includes('download-first');
  const showPrintHint = Boolean(printHint) && !localKeys.includes('print-hint');

  return (
    <WizardFrame
      step={4}
      title="Your syllabus is ready"
      intro="Print it or export it as a PDF, save the HTML, or check the accessibility report below."
      headingRef={headingRef}
      back={onBack ? { label: 'Back', onClick: onBack } : undefined}
      className="download-step"
    >
      <div className="download-bar" role="group" aria-label="Your syllabus file">
        {/* Print is the default action: the browser's print dialog is also the PDF path (Save as PDF). */}
        <Tile variant="primary" size="lg" icon="bi-file-earmark-pdf" className="download-primary" onClick={print}>
          Print / PDF export
        </Tile>
        <Tile variant="secondary" size="md" icon="bi-universal-access" onClick={onDownloadReport}>
          Accessibility report
        </Tile>
        <Tile variant="secondary" size="md" icon="bi-download" onClick={onDownload}>
          Save HTML
        </Tile>
        <p className="download-file">
          <span className="download-filename">
            <VisuallyHidden>File: </VisuallyHidden>
            {filename}
          </span>
          <span className="download-size tnum">
            <VisuallyHidden>Size: </VisuallyHidden>
            {formatBytes(doc.bytes)}
          </span>
        </p>
        <Tile variant="ghost" size="md" icon="bi-arrow-counterclockwise" className="download-restart" onClick={onStartOver}>
          Start over
        </Tile>
      </div>

      <div className="notices">
        {downloaded && (
          <Notice tone="success" id="download-saved">
            {STATUS.saved}
          </Notice>
        )}
        {showPrintHint && printHint && (
          <Notice tone="info" icon="bi-printer" id="download-print-hint" onDismiss={() => dismissLocal('print-hint')} dismissLabel={`Dismiss: ${printHint}`}>
            {printHint}
          </Notice>
        )}
        {showDownloadFirst && (
          <Notice tone="warn" id="download-first" onDismiss={() => dismissLocal('download-first')} dismissLabel={`Dismiss: ${NOTICE_DOWNLOAD_FIRST}`}>
            {NOTICE_DOWNLOAD_FIRST}
          </Notice>
        )}
        {showLarge && (
          <Notice tone="info" id="download-large-file" onDismiss={() => dismissLocal('large-file')} dismissLabel={`Dismiss: ${noticeLargeFile(megabytes(doc.bytes))}`}>
            {noticeLargeFile(megabytes(doc.bytes))}
          </Notice>
        )}
        {shown.map((n) => (
          <Notice
            key={n.key}
            tone="info"
            id={`download-notice-${n.key}`}
            onDismiss={() => n.codes.forEach((c) => onDismissNotice(c))}
            dismissLabel={`Dismiss: ${n.text}`}
          >
            {n.text}
          </Notice>
        ))}
      </div>

      <div className="sg-desk download-desk">
        <div className="sg-sheet sg-sheet-enter download-sheet">
          <iframe
            ref={setFrame}
            className="sg-sheet-frame download-frame"
            sandbox="allow-same-origin allow-modals"
            srcDoc={doc.html}
            title="Your syllabus"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      <A11yReport report={doc.report} />
    </WizardFrame>
  );
}
