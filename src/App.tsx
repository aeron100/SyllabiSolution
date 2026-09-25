import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoticeCode } from './lib/types';
import { Guide, Header, STEP_LABELS, Splash, StepStrip, type StepNumber } from './components/shell';
import { LiveRegion, Notice, Tile, TileLink, VisuallyHidden } from './components/ui';
import { useBeforeUnload } from './hooks/useBeforeUnload';
import { useColorScheme } from './hooks/useColorScheme';
import { useSyllabus } from './hooks/useSyllabus';
import UploadStep from './steps/UploadStep';
import ChooseStep from './steps/ChooseStep';
import ArrangeStep from './steps/ArrangeStep';
import DownloadStep from './steps/DownloadStep';
import { APP_NAME, DIRECTIONS_LABEL, GUIDE, NOTICE_COPY, NOTICE_PRINT_BROWSER, REASSURANCE } from './ui/copy';
import { currentBrowserIsChromium } from './ui/format';
import { guideFor, type GuideFacts } from './ui/guide';
import { KIND_ORDER } from './ui/kinds';

export const START_OVER_CONFIRM = 'Start over? Anything you have not downloaded will be lost.';
export const START_OVER_LABEL = 'Start over';
export const COASTLINE_URL = 'https://www.coastline.edu/';
/** The directions PDF. It ships from public/ into docs/ beside index.html, so the relative link resolves on GitHub Pages. */
export const DIRECTIONS_FILE = 'Directions for the Syllabus Generator Tool.pdf';
export const DIRECTIONS_HREF = encodeURI(DIRECTIONS_FILE);

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
 * Back never loses state. Guide mode (§10 "Guide me") is a preference kept
 * here, in memory only: the header toggle and the splash turn it on, the
 * card's Hide turns it off, and Start over leaves it as it was.
 */
export function App() {
  useColorScheme();
  const [step, setStep] = useState<StepNumber>(1);
  const [maxReached, setMaxReached] = useState<StepNumber>(1);
  const [splash, setSplash] = useState(true);
  const [guide, setGuide] = useState(false);
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
      setSplash(false);
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

  // The splash closing hands focus to the step heading, once the dialog (and the page's inertness) is gone.
  useEffect(() => {
    if (!splash) headingRef.current?.focus({ preventScroll: true });
  }, [splash]);
  const dismissSplash = useCallback((): void => setSplash(false), []);
  const guideFromSplash = useCallback((): void => {
    setGuide(true);
    setSplash(false);
  }, []);
  const hideGuide = useCallback((): void => setGuide(false), []);
  const chromium = useMemo(() => currentBrowserIsChromium(), []);

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

  // The guide card for the step on screen, from what the app can see (src/ui/guide.ts).
  let guideCard = null;
  if (guide) {
    // The step whose body is on screen (the same rule as below: no export is step 1, no document is step 3).
    const guideStep: StepNumber = step === 1 || !cart ? 1 : step === 4 && state.generated === null ? 3 : step;
    const facts: GuideFacts = {
      selected: state.selected.length,
      syllabusChecked: cart !== null && state.selected.some((id) => cart.resources.get(id)?.kind === 'syllabus'),
      previewed: state.focusedId !== null,
      hiddenKinds: KIND_ORDER.filter((k) => model.counts[k] !== undefined && model.hiddenKinds.has(k)),
      instructor: state.cover.instructor.trim() !== '',
      printed: state.printed,
      todo: state.generated ? state.generated.report.todo.length : null,
      chromium,
    };
    guideCard = <Guide step={guideStep} content={guideFor(guideStep, facts)} onHide={hideGuide} />;
  }

  let body = null;
  if (step === 1 || !cart) {
    body = (
      <UploadStep
        onFile={actions.loadFile}
        busy={state.phase === 'reading'}
        status={state.status}
        error={state.error ?? undefined}
        headingRef={headingRef}
        guide={guideCard}
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
        guide={guideCard}
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
        guide={guideCard}
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
        guide={guideCard}
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
        {/* A toggle: the name stays "Guide me" and aria-pressed carries the state; the filled icon and border show it too. */}
        <Tile
          variant="ghost"
          size="md"
          icon={guide ? 'bi-signpost-2-fill' : 'bi-signpost-2'}
          aria-pressed={guide}
          onClick={() => setGuide((on) => !on)}
        >
          {GUIDE.toggle}
        </Tile>
        <TileLink variant="ghost" size="md" icon="bi-file-earmark-pdf" href={DIRECTIONS_HREF} newTab>
          {DIRECTIONS_LABEL}
          <VisuallyHidden> (PDF)</VisuallyHidden>
        </TileLink>
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
      {splash && !cart && <Splash directionsHref={DIRECTIONS_HREF} onGuide={guideFromSplash} onDismiss={dismissSplash} />}
    </div>
  );
}
