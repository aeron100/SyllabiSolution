import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoticeCode } from './lib/types';
import { Header, STEP_LABELS, StepStrip, type StepNumber } from './components/shell';
import { LiveRegion, Notice, Tile } from './components/ui';
import { useBeforeUnload } from './hooks/useBeforeUnload';
import { useColorScheme } from './hooks/useColorScheme';
import { useSyllabus } from './hooks/useSyllabus';
import UploadStep from './steps/UploadStep';
import ChooseStep from './steps/ChooseStep';
import ArrangeStep from './steps/ArrangeStep';
import DownloadStep from './steps/DownloadStep';
import { APP_NAME, NOTICE_COPY, NOTICE_PRINT_BROWSER, REASSURANCE } from './ui/copy';

export const START_OVER_CONFIRM = 'Start over? Anything you have not downloaded will be lost.';
export const START_OVER_LABEL = 'Start over';
export const COASTLINE_URL = 'https://www.coastline.edu/';

/** §14 notices for step 3: one per distinct sentence (two codes share the images copy). */
function groupNotices(codes: readonly NoticeCode[]): { text: string; codes: NoticeCode[] }[] {
  const out: { text: string; codes: NoticeCode[] }[] = [];
  for (const code of codes) {
    const text = NOTICE_COPY[code];
    const hit = out.find((n) => n.text === text);
    if (hit) hit.codes.push(code);
    else out.push({ text, codes: [code] });
  }
  return out;
}

/**
 * Root: the institution header, the four-step strip, and one step at a time
 * (DESIGN.md §10 "Flow"). The wizard position lives here; everything about
 * the course export lives in useSyllabus. Focus moves to the step heading
 * and the page title names the step whenever the step changes (2.4.2).
 * Back never loses state.
 */
export function App() {
  useColorScheme();
  const [step, setStep] = useState<StepNumber>(1);
  const [maxReached, setMaxReached] = useState<StepNumber>(1);
  const model = useSyllabus({ livePreview: step === 3 });
  const { state, actions } = model;
  useBeforeUnload(model.guardArmed);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef<StepNumber>(1);
  const stepRef = useRef<StepNumber>(step);
  stepRef.current = step;

  const go = useCallback((n: StepNumber): void => {
    setStep(n);
    setMaxReached((m) => (n > m ? n : m));
  }, []);

  // A course export arriving (drop, file picker, or the dev-only ?load=) lands on step 2; losing it returns to step 1.
  const cart = state.cart;
  useEffect(() => {
    if (cart) {
      setStep(2);
      setMaxReached(2);
    } else {
      setStep(1);
      setMaxReached(1);
    }
  }, [cart]);

  // Name the step in the page title; focus the step heading on every step change (not on first paint).
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = step === 1 ? APP_NAME : `${STEP_LABELS[step]} – ${APP_NAME}`;
    if (shownStep.current === step) return;
    shownStep.current = step;
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Generate re-runs only when the inputs changed (the hook keeps the memo key).
  const generateThenShow = useCallback((): void => {
    void actions.generate().then((doc) => {
      if (doc && stepRef.current === 3) go(4);
    });
  }, [actions, go]);

  const jump = useCallback(
    (n: StepNumber): void => {
      if (n === 4 && (state.generated === null || model.stale)) {
        // Jumping to Finalize with changed inputs rebuilds first (progress shows on step 3).
        go(3);
        generateThenShow();
        return;
      }
      go(n);
    },
    [go, generateThenShow, state.generated, model.stale],
  );

  const startOver = useCallback((): void => {
    if (!model.guardArmed || window.confirm(START_OVER_CONFIRM)) actions.reset();
  }, [actions, model.guardArmed]);

  const errorNotice =
    step !== 1 && state.error ? (
      <div className="app-notices">
        <Notice tone="error" onDismiss={actions.clearError} dismissLabel="Dismiss error">
          {state.error}
        </Notice>
      </div>
    ) : null;

  const stepNotices =
    step === 3 && model.notices.length > 0 ? (
      <div className="app-notices notices" aria-label="Notices about your pages" role="group">
        {groupNotices(model.notices).map((n) => (
          <Notice
            key={n.codes[0]}
            tone="info"
            onDismiss={() => n.codes.forEach((c) => actions.dismissNotice(c))}
            dismissLabel={`Dismiss: ${n.text}`}
          >
            {n.text}
          </Notice>
        ))}
      </div>
    ) : null;

  let body = null;
  if (step === 1 || !cart) {
    body = (
      <UploadStep
        onFile={actions.loadFile}
        busy={state.phase === 'reading'}
        status={state.status}
        error={state.error ?? undefined}
        headingRef={headingRef}
      />
    );
  } else if (step === 2) {
    body = (
      <ChooseStep
        cart={cart}
        selected={state.selected}
        onToggle={actions.select}
        onToggleMany={actions.selectMany}
        hiddenKinds={model.hiddenKinds}
        onToggleKind={actions.setKindHidden}
        focusedId={state.focusedId ?? undefined}
        onFocus={actions.focus}
        previewSrcdoc={model.previewSrcdoc ?? undefined}
        previewTitle={model.previewTitle ?? undefined}
        previewLoading={state.previewLoading}
        previewError={state.previewError ?? undefined}
        counts={model.counts}
        onBack={() => go(1)}
        onNext={() => go(3)}
        headingRef={headingRef}
      />
    );
  } else if (step === 3 || state.generated === null) {
    body = (
      <ArrangeStep
        cart={cart}
        order={state.selected}
        onMove={actions.move}
        onRemove={actions.remove}
        cover={model.cover}
        onCover={actions.setCover}
        options={model.options}
        onOptions={actions.setOptions}
        includeLogo={state.includeLogo}
        onIncludeLogo={actions.setIncludeLogo}
        livePreviewSrcdoc={model.livePreviewSrcdoc ?? undefined}
        livePreviewLoading={model.livePreviewUpdating}
        onBack={() => go(2)}
        onGenerate={generateThenShow}
        generating={state.phase === 'generating'}
        progress={state.progress ?? undefined}
        headingRef={headingRef}
      />
    );
  } else {
    body = (
      <DownloadStep
        doc={state.generated}
        filename={model.filename}
        onDownload={actions.download}
        onDownloadReport={actions.downloadReport}
        onPrint={actions.notePrinted}
        onStartOver={startOver}
        downloaded={state.downloaded}
        notices={model.notices}
        onDismissNotice={actions.dismissNotice}
        printHint={state.printNotice ? NOTICE_PRINT_BROWSER : undefined}
        onBack={() => go(3)}
        headingRef={headingRef}
      />
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <LiveRegion id="app-status" message={state.status} />
      <Header logoHref={COASTLINE_URL}>
        {cart && (
          <Tile variant="secondary" size="md" icon="bi-arrow-counterclockwise" onClick={startOver}>
            {START_OVER_LABEL}
          </Tile>
        )}
      </Header>
      <StepStrip current={step} maxReached={maxReached} onJump={jump} />
      <main id="main" className="app-main" tabIndex={-1}>
        {errorNotice}
        {stepNotices}
        {body}
      </main>
      <footer className="app-footer">
        <p>{REASSURANCE}</p>
      </footer>
    </div>
  );
}
