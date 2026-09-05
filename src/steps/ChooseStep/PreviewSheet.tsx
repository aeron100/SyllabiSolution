import type { Ref } from 'react';
import { Notice } from '../../components/ui';
import { STATUS } from '../../ui/copy';

export const PREVIEW_TITLE_ID = 'choose-preview-title';
export const PREVIEW_EMPTY = 'Nothing previewed yet.';

export interface PreviewSheetProps {
  /** Complete HTML document for the sandboxed frame; absent while nothing is focused or still loading. */
  srcdoc?: string;
  /** Title of the previewed item, for the caption and the frame's accessible name. */
  title?: string;
  loading: boolean;
  error?: string;
  /** Re-keys the sheet so it slides in when a different item is previewed. */
  focusedId?: string;
  /** One sentence under the title saying what to do; differs for wide and stacked layouts. */
  hint: string;
  /** The paper sheet, so the step can scroll it into view on a narrow screen. */
  sheetRef?: Ref<HTMLDivElement>;
}

/**
 * The preview pane: the right grid column of step 2. "Preview" title, a
 * one-line hint, then a sheet of paper on the desk (DESIGN.md §10
 * "Metaphor") holding a fully sandboxed iframe (sandbox="": no scripts, no
 * same-origin, no forms, no navigation). Empty, loading, and error states
 * live inside the same sheet so the layout never jumps. On wide screens the
 * whole section sticks to the top of its own grid column (choose.css).
 */
export default function PreviewSheet({ srcdoc, title, loading, error, focusedId, hint, sheetRef }: PreviewSheetProps) {
  const ready = Boolean(srcdoc && title);
  return (
    <section className="wizard-col choose-preview" aria-labelledby={PREVIEW_TITLE_ID}>
      <h3 className="wizard-col-title choose-preview-caption" id={PREVIEW_TITLE_ID}>
        Preview
        {title && (
          <>
            <span aria-hidden="true" className="choose-preview-dot">
              ·
            </span>
            <span className="choose-preview-title">{title}</span>
          </>
        )}
      </h3>
      <p className="sg-hint choose-preview-hint">{hint}</p>
      <div
        key={focusedId ?? 'none'}
        ref={sheetRef}
        className={`sg-sheet choose-preview-sheet${ready ? ' sg-sheet-enter' : ''}`}
        aria-busy={loading || undefined}
      >
        {loading && (
          <p className="choose-preview-status" role="status">
            <span className="spinner-border spinner-border-sm" aria-hidden="true" />
            {STATUS.previewing}
          </p>
        )}
        {error && (
          <div className="choose-preview-notice">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {ready ? (
          <iframe
            className="sg-sheet-frame choose-preview-frame"
            sandbox=""
            srcDoc={srcdoc}
            title={`Preview of ${title}`}
            referrerPolicy="no-referrer"
          />
        ) : (
          !loading && !error && <p className="sg-empty choose-preview-empty">{PREVIEW_EMPTY}</p>
        )}
      </div>
    </section>
  );
}
