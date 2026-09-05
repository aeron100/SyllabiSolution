import { useCallback, useEffect, useRef, useState } from 'react';

export interface LivePreviewProps {
  /** Complete HTML document for the sandboxed iframe, or undefined when there is nothing to show yet. */
  srcdoc?: string;
  /** True while a newer document is pending or being assembled; the old one stays on screen. */
  loading?: boolean;
  /** True when at least one page is in the syllabus; drives the empty-state sentence. */
  hasPages: boolean;
}

export const PREVIEW_TITLE_ID = 'arrange-preview-title';
export const PREVIEW_TITLE = 'Live preview';
export const PREVIEW_HEADING = 'Preview';
export const PREVIEW_HINT = 'Updates as you change the look, order, and cover.';
export const PREVIEW_UPDATING = 'Updating preview…';
export const PREVIEW_WAITING = 'The preview will appear here in a moment.';
export const PREVIEW_EMPTY = 'Add a page on the Choose pages step to see a preview.';
/**
 * How long an update must have been pending before the "Updating…" chip is
 * shown and announced. A look change re-assembles from cached pages in well
 * under this, and the 300 ms typing debounce alone never reaches it, so the
 * chip neither blinks on every palette click nor talks between typed words;
 * only a wait long enough to notice (a large export, the first build) does.
 */
export const PREVIEW_CHIP_DELAY_MS = 400;

/**
 * The live document preview: a permanent pane (DESIGN.md §10 step 3) with a
 * sheet of paper on the desk holding the assembled document in an iframe.
 *
 * Sandbox: `allow-same-origin` only. The document can never run script (no
 * `allow-scripts`), and the assembler's final guard (src/lib/generate/guard.ts)
 * strips every script, handler, and script URL from what goes in, so
 * same-origin access is safe. It is needed so the pane can read the
 * document's scroll position and put it back after each update. The step-2
 * preview and the step-4 result keep their own sandboxes.
 *
 * Between updates the old document stays on screen (never a blank pane): the
 * iframe element is kept and only `srcdoc` changes. The part being replaced
 * (`.arrange-preview-doc`) is `aria-busy` for the whole wait; the "Updating…"
 * chip sits over the sheet's corner only once the wait passes
 * PREVIEW_CHIP_DELAY_MS. The chip's container is a persistent polite live
 * region and a sibling of the busy part, not a descendant — assistive
 * technology may hold back changes inside a busy subtree until it is no
 * longer busy, by which time the chip would be gone — so the status is
 * announced without moving focus (the LiveRegion pattern).
 *
 * Scroll preservation: on each document's `load` the pane restores the last
 * recorded offset, then listens to that document's window. `scroll` keeps the
 * offset current, and `pagehide` — fired on the old document the instant the
 * browser swaps in the next `srcdoc` — takes the final reading, so the
 * position is captured before the swap even if no scroll event was seen.
 * Restoration is an instant `scrollTo`; nothing animates (reduced motion).
 * Every touch of the frame's window is guarded: a reader can follow an
 * external link inside the preview, after which the window is cross-origin
 * and any access to it throws.
 */
export function LivePreview({ srcdoc, loading = false, hasPages }: LivePreviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const scrollYRef = useRef(0);
  const detachRef = useRef<(() => void) | null>(null);

  // The chip (and its announcement) only for a wait long enough to notice.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), PREVIEW_CHIP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const onLoad = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    const detach = detachRef.current;
    detachRef.current = null;
    try {
      detach?.();
    } catch {
      // The previous document navigated away (an external link): its window is no longer ours to touch.
    }
    try {
      // Restore the previous document's position (instant; nothing animates).
      if (scrollYRef.current > 0) win.scrollTo(0, scrollYRef.current);
      const record = (): void => {
        scrollYRef.current = win.scrollY;
      };
      win.addEventListener('scroll', record, { passive: true });
      // The last reading before the swap: the old document is hidden right before the next one is shown.
      win.addEventListener('pagehide', record);
      detachRef.current = () => {
        win.removeEventListener('scroll', record);
        win.removeEventListener('pagehide', record);
      };
    } catch {
      // A cross-origin or otherwise inaccessible window simply loses the scroll position.
    }
  }, []);

  const status = srcdoc ? null : hasPages ? PREVIEW_WAITING : PREVIEW_EMPTY;

  return (
    <section className="arrange-preview" aria-labelledby={PREVIEW_TITLE_ID}>
      <h3 className="wizard-col-title" id={PREVIEW_TITLE_ID}>
        {PREVIEW_HEADING}
      </h3>
      <p className="sg-hint arrange-preview-hint">{PREVIEW_HINT}</p>
      <div className="sg-desk arrange-preview-desk">
        <div className="sg-sheet arrange-preview-sheet sg-sheet-enter">
          <div className="arrange-preview-status" role="status" aria-live="polite" aria-atomic="true">
            {slow && (
              <span className="arrange-preview-chip">
                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                {PREVIEW_UPDATING}
              </span>
            )}
          </div>
          <div className="arrange-preview-doc" aria-busy={loading || undefined}>
            {srcdoc ? (
              <iframe
                ref={frameRef}
                className="sg-sheet-frame arrange-preview-frame"
                sandbox="allow-same-origin"
                srcDoc={srcdoc}
                title={PREVIEW_TITLE}
                referrerPolicy="no-referrer"
                onLoad={onLoad}
              />
            ) : (
              <p className="sg-empty arrange-preview-empty">{status}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
