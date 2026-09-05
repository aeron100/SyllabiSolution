/**
 * The app's single state model and pipeline wiring (DESIGN.md §4, §10).
 *
 *   file / URL   → openCartridge → READ_OK (syllabus pre-checked, status "Found N pages…")
 *   focus row    → extractContent → processContent → step-2 preview (cached per page)
 *   step 3       → every selected page processed (cache) → assembleDocument → live preview
 *                  (keyed on the same inputs Generate uses; debounced 300 ms after an
 *                  order/cover edit, 50 ms after a look change, which only re-assembles)
 *   Generate     → same per selected id, sequentially with progress → assembleDocument;
 *                  reuses the live preview's document when the inputs are unchanged
 *   Download     → Blob → disarm the leave-page guard
 *
 * The wizard's step lives in App; this hook owns everything about the
 * course export, the selection, the options, and the documents built from
 * them. Components are pure; everything stateful lives here.
 */
import { KIND_LABEL } from '../lib/types';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  AssembledDoc,
  AssetRef,
  Cartridge,
  CoverInfo,
  DocOptions,
  Kind,
  NoticeCode,
  PaletteId,
  Presentation,
  ProcessedPage,
  SyllabusDoc,
} from '../lib/types';
import { extractContent, makeAssetResolver, makeWikiResolver, openCartridge } from '../lib/cartridge';
import { downscaleImage, processContent } from '../lib/process';
import { DEFAULT_PALETTE, assembleDocument, themeCss } from '../lib/generate';
import { NOTICE_ORDER, STATUS } from '../ui/copy';
import {
  currentBrowserIsChromium,
  errorMessage,
  primaryLanguage,
  reportFilename,
  syllabusFilename,
} from '../ui/format';
import { LOGO_DATA_URI } from '../ui/assets';
import { COVER_FIELDS, type CoverFields } from '../ui/model';
import { buildPreviewSrcdoc } from '../ui/preview';
import { buildReportText } from '../ui/report';
import {
  addMany,
  countModules,
  insertInOrder,
  kindCounts,
  moveItem,
  orderIndex,
  removeMany,
  selectionKey,
  treeOrder,
} from '../ui/tree';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Phase = 'empty' | 'reading' | 'ready' | 'generating';

/** Institution named on the cover when the logo is included (DESIGN.md §10 "Branding"). */
export const INSTITUTION = 'Coastline College';
/** Debounce for the step-3 live preview after a content change (order, cover, language, logo). */
export const LIVE_PREVIEW_DELAY_MS = 300;
/**
 * Debounce after a look change (presentation, palette, cover/TOC/page-break
 * toggles). These never reprocess a page — every ProcessedPage comes from
 * the cache — so the rebuild is a cheap re-assembly and can be near-instant.
 */
export const LIVE_PREVIEW_LOOK_DELAY_MS = 50;

/** Why the live preview is out of date: picks the debounce. */
export type LiveReason = 'look' | 'content';

export interface Progress {
  done: number;
  total: number;
}

/** A document assembled for the live preview, keyed by the inputs it came from. */
export interface LiveDoc {
  key: string;
  doc: AssembledDoc;
}

export interface SyllabusState {
  phase: Phase;
  cart: Cartridge | null;
  /** Visible error (role=alert). Not repeated in `status`, so it is announced once. */
  error: string | null;
  /** Live-region text: "Reading your course export…", "Found 33 pages in 9 modules." */
  status: string;
  /**
   * The selection, in document order: checking a page appends it, step 3's
   * Move up / Move down reorder it, and both steps read from this one list
   * (DESIGN.md §10 "the order of selection is the order of the document").
   */
  selected: string[];
  hiddenKinds: Kind[];
  /** The item shown in the step-2 preview. */
  focusedId: string | null;
  preview: ProcessedPage | null;
  previewLoading: boolean;
  previewError: string | null;
  presentation: Presentation;
  palette: PaletteId;
  showCover: boolean;
  showToc: boolean;
  pageBreaks: boolean;
  /** BCP-47 primary tag for the document. */
  language: string;
  cover: CoverFields;
  /** Put the institution mark and name on the cover. The mark is inlined at build time (LOGO_DATA_URI); kept across course exports. */
  includeLogo: boolean;
  livePreview: LiveDoc | null;
  /** True while a live-preview build is in flight (LIVE_START → LIVE_OK / LIVE_FAIL / LIVE_DROP). */
  livePreviewLoading: boolean;
  /** What last changed the document's inputs; a look change rebuilds the live preview sooner. */
  liveReason: LiveReason;
  /**
   * The inputs key whose live build (or generation) failed. No rebuild is
   * scheduled for it — the error notice stands alone and the pane is not
   * busy — until the next edit, which clears it and retries.
   */
  liveFailedKey: string | null;
  generated: AssembledDoc | null;
  /** Snapshot key of the inputs the current document was generated from. */
  generatedKey: string | null;
  downloaded: boolean;
  progress: Progress | null;
  /** Contextual notices the user has dismissed (kept for the session). */
  dismissed: NoticeCode[];
  printNotice: boolean;
  /** Notices per processed resource id (from previews and generation). */
  pageNotices: Record<string, NoticeCode[]>;
}

/** Kinds shown by default on step 2: the ones most likely to be syllabus material (DESIGN.md §10). */
export const SHOWN_BY_DEFAULT: ReadonlySet<Kind> = new Set<Kind>(['syllabus', 'page']);
/** Every other kind starts hidden behind "Content types": listed and selectable once shown, never counted as pages. */
export const HIDDEN_BY_DEFAULT: ReadonlySet<Kind> = new Set<Kind>(
  (Object.keys(KIND_LABEL) as Kind[]).filter((k) => !SHOWN_BY_DEFAULT.has(k)),
);

const initialCover: CoverFields = { instructor: '', email: '', officeHours: '', meetingTimes: '' };

export const initialState: SyllabusState = {
  phase: 'empty',
  cart: null,
  error: null,
  status: '',
  selected: [],
  // Files and Other start hidden (still listed and selectable once shown) so
  // the tree opens on real content without anything going missing (DESIGN.md §10).
  hiddenKinds: [...HIDDEN_BY_DEFAULT],
  focusedId: null,
  preview: null,
  previewLoading: false,
  previewError: null,
  presentation: 'styled',
  palette: DEFAULT_PALETTE,
  showCover: true,
  showToc: true,
  pageBreaks: true,
  language: 'en',
  cover: initialCover,
  includeLogo: true,
  livePreview: null,
  livePreviewLoading: false,
  liveReason: 'content',
  liveFailedKey: null,
  generated: null,
  generatedKey: null,
  downloaded: false,
  progress: null,
  dismissed: [],
  printNotice: false,
  pageNotices: {},
};

type Action =
  | { type: 'READ_START' }
  | { type: 'READ_OK'; cart: Cartridge; selected: string[]; language: string; status: string }
  | { type: 'READ_FAIL'; error: string }
  | { type: 'RESET' }
  | { type: 'ERROR'; error: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_SELECTED'; selected: string[] }
  | { type: 'SET_KIND_HIDDEN'; kind: Kind; hidden: boolean }
  | { type: 'FOCUS'; id: string }
  | { type: 'PREVIEW_START' }
  | { type: 'PREVIEW_OK'; page: ProcessedPage }
  | { type: 'PREVIEW_FAIL'; error: string }
  | { type: 'SET_OPTIONS'; patch: Partial<DocOptions> }
  | { type: 'SET_COVER'; patch: Partial<CoverFields> }
  | { type: 'SET_INCLUDE_LOGO'; on: boolean }
  | { type: 'LIVE_START' }
  | { type: 'LIVE_OK'; key: string; doc: AssembledDoc; notices: Record<string, NoticeCode[]> }
  | { type: 'LIVE_FAIL'; error: string; key: string }
  /** An in-flight live build was abandoned because its inputs changed (or the step left the screen). */
  | { type: 'LIVE_DROP' }
  | { type: 'GEN_START'; total: number }
  | { type: 'GEN_PROGRESS'; done: number }
  | { type: 'GEN_OK'; doc: AssembledDoc; key: string; notices: Record<string, NoticeCode[]> }
  | { type: 'GEN_FAIL'; error: string; key: string }
  | { type: 'DOWNLOADED' }
  | { type: 'DISMISS'; code: NoticeCode }
  | { type: 'PRINT_NOTICE' }
  | { type: 'STATUS'; status: string };

function reducer(s: SyllabusState, a: Action): SyllabusState {
  switch (a.type) {
    case 'READ_START':
      return { ...s, phase: 'reading', error: null, status: STATUS.reading };
    case 'READ_OK':
      return {
        ...initialState,
        phase: 'ready',
        cart: a.cart,
        selected: a.selected,
        status: a.status,
        language: a.language,
        includeLogo: s.includeLogo,
      };
    case 'READ_FAIL':
      return { ...s, phase: s.cart ? 'ready' : 'empty', error: a.error, status: '' };
    case 'RESET':
      return initialState;
    case 'ERROR':
      return { ...s, error: a.error };
    case 'CLEAR_ERROR':
      return { ...s, error: null };
    case 'SET_SELECTED':
      return { ...s, selected: a.selected, liveReason: 'content', liveFailedKey: null };
    case 'SET_KIND_HIDDEN': {
      const without = s.hiddenKinds.filter((k) => k !== a.kind);
      return { ...s, hiddenKinds: a.hidden ? [...without, a.kind] : without };
    }
    case 'FOCUS':
      return { ...s, focusedId: a.id, previewError: null };
    case 'PREVIEW_START':
      return { ...s, previewLoading: true, previewError: null };
    case 'PREVIEW_OK':
      return {
        ...s,
        preview: a.page,
        previewLoading: false,
        previewError: null,
        pageNotices: { ...s.pageNotices, [a.page.resourceId]: a.page.notices },
      };
    case 'PREVIEW_FAIL':
      return { ...s, preview: null, previewLoading: false, previewError: a.error };
    case 'SET_OPTIONS': {
      const p = a.patch;
      // Language changes the processed text (it is part of the page cache key); everything else is a look.
      const reason: LiveReason = p.language !== undefined ? 'content' : 'look';
      return {
        ...s,
        presentation: p.presentation ?? s.presentation,
        palette: p.palette ?? s.palette,
        showCover: p.showCover ?? s.showCover,
        showToc: p.showToc ?? s.showToc,
        pageBreaks: p.pageBreaks ?? s.pageBreaks,
        language: p.language !== undefined ? primaryLanguage(p.language) : s.language,
        liveReason: reason,
        liveFailedKey: null,
      };
    }
    case 'SET_COVER': {
      const cover = { ...s.cover };
      for (const f of COVER_FIELDS) {
        const v = a.patch[f];
        if (typeof v === 'string') cover[f] = v;
      }
      return { ...s, cover, liveReason: 'content', liveFailedKey: null };
    }
    case 'SET_INCLUDE_LOGO':
      return { ...s, includeLogo: a.on, liveReason: 'content', liveFailedKey: null };
    case 'LIVE_START':
      return { ...s, livePreviewLoading: true };
    case 'LIVE_OK':
      return {
        ...s,
        livePreview: { key: a.key, doc: a.doc },
        livePreviewLoading: false,
        liveFailedKey: null,
        pageNotices: { ...s.pageNotices, ...a.notices },
      };
    case 'LIVE_FAIL':
      return { ...s, livePreviewLoading: false, liveFailedKey: a.key, error: a.error };
    case 'LIVE_DROP':
      return s.livePreviewLoading ? { ...s, livePreviewLoading: false } : s;
    case 'GEN_START':
      return {
        ...s,
        phase: 'generating',
        error: null,
        status: STATUS.generating,
        progress: { done: 0, total: a.total },
        livePreviewLoading: false,
      };
    case 'GEN_PROGRESS':
      return { ...s, progress: s.progress ? { ...s.progress, done: a.done } : null };
    case 'GEN_OK':
      return {
        ...s,
        phase: 'ready',
        generated: a.doc,
        generatedKey: a.key,
        downloaded: false,
        progress: null,
        status: STATUS.ready,
        printNotice: false,
        livePreview: { key: a.key, doc: a.doc },
        livePreviewLoading: false,
        liveFailedKey: null,
        pageNotices: { ...s.pageNotices, ...a.notices },
      };
    case 'GEN_FAIL':
      // The live preview would fail the same way for these inputs: do not retry it until the next edit.
      return { ...s, phase: 'ready', progress: null, error: a.error, status: '', livePreviewLoading: false, liveFailedKey: a.key };
    case 'DOWNLOADED':
      // Announced through the app's one live region (the step's "Saved" notice is static).
      return { ...s, downloaded: true, status: announce(s.status, STATUS.saved) };
    case 'DISMISS':
      return { ...s, dismissed: s.dismissed.includes(a.code) ? s.dismissed : [...s.dismissed, a.code] };
    case 'PRINT_NOTICE':
      return { ...s, printNotice: true };
    case 'STATUS':
      return { ...s, status: announce(s.status, a.status) };
    default:
      return s;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Resolvers {
  asset: (href: string) => Promise<AssetRef | null>;
  wiki?: (ref: string) => string | null;
}

/**
 * Everything the generated document depends on. Generate re-runs only when
 * this changes; the live preview is keyed on it too.
 */
export function docKey(s: SyllabusState): string {
  return JSON.stringify([
    s.selected,
    s.presentation,
    s.palette,
    s.showCover,
    s.showToc,
    s.pageBreaks,
    s.language,
    s.cover,
    s.includeLogo,
  ]);
}

function docOptions(s: SyllabusState): DocOptions {
  return {
    presentation: s.presentation,
    palette: s.palette,
    showCover: s.showCover,
    showToc: s.showToc,
    pageBreaks: s.pageBreaks,
    language: s.language || 'en',
  };
}

/** Cover info for the form (raw) or for assembly (trimmed, empties dropped). */
function coverInfo(s: SyllabusState, cart: Cartridge, forDocument: boolean): CoverInfo {
  const cover: CoverInfo = { courseTitle: cart.title };
  if (cart.courseCode) cover.courseCode = cart.courseCode;
  if (cart.term) cover.term = cart.term;
  for (const f of COVER_FIELDS) {
    const v = forDocument ? s.cover[f].trim() : s.cover[f];
    if (v || !forDocument) cover[f] = v;
  }
  if (s.includeLogo) {
    cover.institution = INSTITUTION;
    cover.logoDataUri = LOGO_DATA_URI;
  }
  return cover;
}

function syllabusDoc(s: SyllabusState, cart: Cartridge, sections: ProcessedPage[]): SyllabusDoc {
  return { options: docOptions(s), cover: coverInfo(s, cart, true), sections };
}

function saveBlob(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A live-region text that is the same as the last one is not re-announced
 * (aria-atomic); vary a trailing no-break space so "Saved." reads twice.
 */
function announce(prev: string, text: string): string {
  return prev === text ? `${text}\u00A0` : text;
}

function safeThemeCss(p: Presentation, palette: PaletteId): string {
  try {
    return themeCss(p, palette);
  } catch (e) {
    console.warn('themeCss failed', e);
    return '';
  }
}

/** Order, de-duplicate, and filter notice codes for display (DESIGN.md §14). */
function visibleNotices(codes: Iterable<NoticeCode>, s: SyllabusState): NoticeCode[] {
  const set = new Set(codes);
  return NOTICE_ORDER.filter(
    (c) => set.has(c) && !s.dismissed.includes(c) && (c !== 'low-contrast' || s.presentation === 'original'),
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface SyllabusActions {
  loadFile: (file: File) => void;
  reset: () => void;
  showError: (message: string) => void;
  clearError: () => void;
  /** Check or uncheck one page. Idempotent. */
  select: (id: string, on: boolean) => void;
  selectMany: (ids: string[], on: boolean) => void;
  move: (id: string, dir: -1 | 1) => void;
  remove: (id: string) => void;
  setKindHidden: (kind: Kind, hidden: boolean) => void;
  focus: (id: string) => void;
  setOptions: (patch: Partial<DocOptions>) => void;
  /** Only instructor, email, officeHours, meetingTimes are taken from the patch. */
  setCover: (patch: Partial<CoverInfo>) => void;
  setIncludeLogo: (on: boolean) => void;
  /**
   * Build the document. Resolves with it when done, or null when nothing
   * could be built (no pages, already generating, or an error, which is
   * shown in `state.error`). Returns the existing document at once when
   * the inputs have not changed since it was generated.
   */
  generate: () => Promise<AssembledDoc | null>;
  download: () => void;
  downloadReport: () => void;
  notePrinted: () => void;
  dismissNotice: (code: NoticeCode) => void;
}

export interface SyllabusModel {
  state: SyllabusState;
  /** Resources per kind in the export; only kinds present have a count. */
  counts: Partial<Record<Kind, number>>;
  hiddenKinds: Set<Kind>;
  selectedSet: Set<string>;
  options: DocOptions;
  /** Cover as shown in the form: raw field values, plus institution/logo when included. */
  cover: CoverInfo;
  /** Contextual notices (§14) for the current document, in display order, minus dismissed ones. */
  notices: NoticeCode[];
  previewSrcdoc: string | null;
  previewTitle: string | null;
  /**
   * The most recent live-preview document while at least one page is selected.
   * It may lag the inputs briefly (see `livePreviewUpdating`); Generate checks
   * the key itself and never reuses a stale one.
   */
  livePreviewSrcdoc: string | null;
  /**
   * True from the change that outdates the live preview until the rebuilt
   * document lands — or the build fails (the error notice then stands alone;
   * the next edit retries).
   */
  livePreviewUpdating: boolean;
  filename: string;
  /** True when a document exists but the inputs have changed since. */
  stale: boolean;
  guardArmed: boolean;
  actions: SyllabusActions;
}

export interface UseSyllabusOptions {
  /** Keep the step-3 live preview up to date (only while that step is on screen). */
  livePreview?: boolean;
}

export function useSyllabus({ livePreview: liveActive = false }: UseSyllabusOptions = {}): SyllabusModel {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Latest state for async closures, plus per-cartridge resolvers and cache.
  const stateRef = useRef(state);
  stateRef.current = state;
  const resolversRef = useRef<Resolvers | null>(null);
  const cacheRef = useRef(new Map<string, ProcessedPage>());
  const previewReq = useRef(0);
  const liveReq = useRef(0);
  const loadSeq = useRef(0);
  const bootRef = useRef(false);

  const order = useMemo(() => (state.cart ? treeOrder(state.cart) : []), [state.cart]);
  const index = useMemo(() => orderIndex(order), [order]);
  const counts = useMemo(() => {
    const out: Partial<Record<Kind, number>> = {};
    if (state.cart) for (const [k, n] of kindCounts(state.cart, order)) out[k] = n;
    return out;
  }, [state.cart, order]);
  const hiddenKinds = useMemo(() => new Set(state.hiddenKinds), [state.hiddenKinds]);
  const selectedSet = useMemo(() => new Set(state.selected), [state.selected]);
  const selKey = useMemo(() => selectionKey(state.selected), [state.selected]);
  const key = docKey(state);

  // -- loading --------------------------------------------------------------

  const loadData = useCallback(async (data: ArrayBuffer | Blob | Uint8Array): Promise<void> => {
    const seq = ++loadSeq.current;
    dispatch({ type: 'READ_START' });
    try {
      const cart = await openCartridge(data);
      if (seq !== loadSeq.current) return;
      resolversRef.current = {
        asset: makeAssetResolver(cart, { downscale: downscaleImage }),
        wiki: makeWikiResolver(cart),
      };
      cacheRef.current = new Map();
      previewReq.current++;
      liveReq.current++;
      const ord = treeOrder(cart);
      const selected = ord.filter((id) => cart.resources.get(id)?.kind === 'syllabus');
      const browserLang = typeof navigator !== 'undefined' ? navigator.language : undefined;
      dispatch({
        type: 'READ_OK',
        cart,
        selected,
        language: primaryLanguage(cart.language || browserLang),
        // Count content only: files and "other" items start hidden and are not pages (DESIGN.md §10).
        status: STATUS.found(ord.filter((id) => !HIDDEN_BY_DEFAULT.has(cart.resources.get(id)?.kind ?? 'other')).length, countModules(cart)),
      });
    } catch (e) {
      if (seq !== loadSeq.current) return;
      dispatch({ type: 'READ_FAIL', error: `Could not read that course export. ${errorMessage(e)}` });
    }
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      void loadData(file);
    },
    [loadData],
  );

  // ?load=<url> on startup: a dev/testing aid only (DESIGN.md §10, §15 "Neither exists in the
  // production build"). The app's only fetch lives inside this DEV guard and is not exported, so
  // the production bundle carries no fetch at all; test/build/single-file.test.ts asserts it.
  // Guarded against StrictMode double-run.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (bootRef.current || typeof window === 'undefined') return;
    bootRef.current = true;
    const url = new URLSearchParams(window.location.search).get('load');
    if (!url) return;
    void (async () => {
      const seq = ++loadSeq.current;
      dispatch({ type: 'READ_START' });
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Dev servers answer unknown paths with index.html and HTTP 200.
        if (/text\/html/i.test(res.headers.get('content-type') ?? '')) throw new Error('File not found.');
        const buf = await res.arrayBuffer();
        if (seq !== loadSeq.current) return;
        await loadData(buf);
      } catch (e) {
        if (seq !== loadSeq.current) return;
        dispatch({ type: 'READ_FAIL', error: `Could not load the course export. ${errorMessage(e)}` });
      }
    })();
  }, [loadData]);

  const reset = useCallback(() => {
    loadSeq.current++;
    previewReq.current++;
    liveReq.current++;
    resolversRef.current = null;
    cacheRef.current = new Map();
    dispatch({ type: 'RESET' });
  }, []);

  const showError = useCallback((message: string) => dispatch({ type: 'ERROR', error: message }), []);
  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  // -- processing -----------------------------------------------------------

  const getProcessed = useCallback(async (id: string, selected: string[], language: string): Promise<ProcessedPage> => {
    const cart = stateRef.current.cart;
    const resolvers = resolversRef.current;
    if (!cart || !resolvers) throw new Error('No course export is loaded.');
    const cacheKey = `${id}::${selectionKey(selected)}::${language}`;
    const hit = cacheRef.current.get(cacheKey);
    if (hit) return hit;
    const resource = cart.resources.get(id);
    if (!resource) throw new Error(`Unknown page: ${id}`);
    const content = await extractContent(cart, id);
    const page = await processContent(content, {
      sectionId: `sec-${id}`,
      sectionTitle: resource.title,
      selectedSections: new Map(selected.map((s) => [s, `sec-${s}`])),
      resolveAsset: resolvers.asset,
      resolveWikiRef: resolvers.wiki,
      language,
    });
    cacheRef.current.set(cacheKey, page);
    return page;
  }, []);

  // Step-2 preview: lazily process the focused item; debounced; stale results ignored.
  useEffect(() => {
    const id = state.focusedId;
    if (!id || !state.cart) return;
    const req = ++previewReq.current;
    const timer = setTimeout(() => {
      void (async () => {
        dispatch({ type: 'PREVIEW_START' });
        try {
          const page = await getProcessed(id, stateRef.current.selected, stateRef.current.language || 'en');
          if (req !== previewReq.current) return;
          dispatch({ type: 'PREVIEW_OK', page });
        } catch (e) {
          if (req !== previewReq.current) return;
          dispatch({ type: 'PREVIEW_FAIL', error: `Could not preview that page. ${errorMessage(e)}` });
        }
      })();
    }, 120);
    return () => clearTimeout(timer);
  }, [state.focusedId, state.cart, selKey, state.language, getProcessed]);

  // Step-3 live preview: every selected page (cached) assembled into the real
  // document, 300 ms after the last content edit or 50 ms after a look change
  // (a look change touches only assembly: getProcessed hits cacheRef for every
  // page, since its key is id + selection + language). Only while the step is
  // on screen. The previous document stays in `livePreview` until LIVE_OK, so
  // the pane never blanks between updates.
  //
  // Every change to the effect's inputs invalidates whatever is scheduled or
  // in flight (the cleanup bumps `liveReq`, so a build whose inputs were
  // reverted mid-flight is dropped too, never shown), and a build that had
  // started reports LIVE_DROP so the loading flag never outlives it. A key
  // whose build failed is not retried until the next edit (`liveFailedKey`).
  const liveKey = state.livePreview?.key ?? null;
  const livePending =
    liveActive &&
    state.cart !== null &&
    state.phase === 'ready' &&
    state.selected.length > 0 &&
    liveKey !== key &&
    state.liveFailedKey !== key;
  useEffect(() => {
    if (!livePending) return;
    const delay = state.liveReason === 'look' ? LIVE_PREVIEW_LOOK_DELAY_MS : LIVE_PREVIEW_DELAY_MS;
    const req = ++liveReq.current;
    let started = false;
    const timer = setTimeout(() => {
      // Invalidated between scheduling and firing (Generate or a reset bumped the counter).
      if (req !== liveReq.current) return;
      started = true;
      dispatch({ type: 'LIVE_START' });
      void (async () => {
        const s = stateRef.current;
        const k = docKey(s);
        try {
          const cart = s.cart;
          if (!cart) return;
          const ids = [...s.selected];
          const language = s.language || 'en';
          const sections: ProcessedPage[] = [];
          const notices: Record<string, NoticeCode[]> = {};
          for (const id of ids) {
            const page = await getProcessed(id, ids, language);
            if (req !== liveReq.current) return;
            sections.push(page);
            notices[id] = page.notices;
          }
          const doc = assembleDocument(syllabusDoc(s, cart, sections));
          if (req !== liveReq.current) return;
          dispatch({ type: 'LIVE_OK', key: k, doc, notices });
        } catch (e) {
          if (req !== liveReq.current) return;
          dispatch({ type: 'LIVE_FAIL', error: `Could not build the preview. ${errorMessage(e)}`, key: k });
        }
      })();
    }, delay);
    return () => {
      clearTimeout(timer);
      liveReq.current++;
      if (started) dispatch({ type: 'LIVE_DROP' });
    };
  }, [livePending, state.liveReason, key, getProcessed]);

  // -- selection ------------------------------------------------------------
  // One ordered list, `state.selected`, is the document order. Checking a
  // page appends it (re-checking appends again, at the end); unchecking drops
  // it and later pages renumber. Bulk adds append the missing pages in tree
  // order after what is already there. Reordering is step 3's job (move).

  const select = useCallback((id: string, on: boolean) => {
    const s = stateRef.current;
    const has = s.selected.includes(id);
    if (has === on) return;
    const selected = on ? insertInOrder(s.selected, id) : removeMany(s.selected, [id]);
    dispatch({ type: 'SET_SELECTED', selected });
  }, []);

  const selectMany = useCallback(
    (ids: string[], on: boolean) => {
      const s = stateRef.current;
      dispatch({
        type: 'SET_SELECTED',
        selected: on ? addMany(s.selected, ids, index) : removeMany(s.selected, ids),
      });
    },
    [index],
  );

  const move = useCallback((id: string, dir: -1 | 1) => {
    dispatch({ type: 'SET_SELECTED', selected: moveItem(stateRef.current.selected, id, dir) });
  }, []);

  const remove = useCallback((id: string) => {
    dispatch({ type: 'SET_SELECTED', selected: removeMany(stateRef.current.selected, [id]) });
  }, []);

  const setKindHidden = useCallback((kind: Kind, hidden: boolean) => dispatch({ type: 'SET_KIND_HIDDEN', kind, hidden }), []);
  const focus = useCallback((id: string) => dispatch({ type: 'FOCUS', id }), []);
  const setOptions = useCallback((patch: Partial<DocOptions>) => dispatch({ type: 'SET_OPTIONS', patch }), []);
  const setCover = useCallback((patch: Partial<CoverInfo>) => dispatch({ type: 'SET_COVER', patch }), []);
  const setIncludeLogo = useCallback((on: boolean) => dispatch({ type: 'SET_INCLUDE_LOGO', on }), []);

  // -- generate / download / print -----------------------------------------

  const generate = useCallback(async (): Promise<AssembledDoc | null> => {
    const s = stateRef.current;
    const cart = s.cart;
    if (!cart || s.phase !== 'ready' || s.selected.length === 0) return null;
    const k = docKey(s);
    if (s.generated && s.generatedKey === k) return s.generated;
    const ids = [...s.selected];
    const language = s.language || 'en';
    // The live preview already built exactly this document.
    if (s.livePreview && s.livePreview.key === k) {
      dispatch({ type: 'GEN_OK', doc: s.livePreview.doc, key: k, notices: {} });
      return s.livePreview.doc;
    }
    // Only a real build takes over from the live preview; the early returns above leave it running.
    liveReq.current++;
    dispatch({ type: 'GEN_START', total: ids.length });
    try {
      const sections: ProcessedPage[] = [];
      const notices: Record<string, NoticeCode[]> = {};
      for (let i = 0; i < ids.length; i++) {
        const page = await getProcessed(ids[i], ids, language);
        sections.push(page);
        notices[ids[i]] = page.notices;
        dispatch({ type: 'GEN_PROGRESS', done: i + 1 });
        await nextTick(); // let the progress bar paint between sections
      }
      if (stateRef.current.cart !== cart) return null; // reset while generating
      const doc = assembleDocument(syllabusDoc(s, cart, sections));
      dispatch({ type: 'GEN_OK', doc, key: k, notices });
      return doc;
    } catch (e) {
      if (stateRef.current.cart !== cart) return null;
      dispatch({ type: 'GEN_FAIL', error: `Could not generate the syllabus. ${errorMessage(e)}`, key: k });
      return null;
    }
  }, [getProcessed]);

  const filename = useMemo(
    () => (state.cart ? syllabusFilename(state.cart.courseCode, state.cart.title) : 'syllabus.html'),
    [state.cart],
  );

  const download = useCallback(() => {
    const s = stateRef.current;
    if (!s.generated || !s.cart) return;
    try {
      saveBlob(s.generated.html, 'text/html;charset=utf-8', syllabusFilename(s.cart.courseCode, s.cart.title));
      dispatch({ type: 'DOWNLOADED' });
    } catch (e) {
      dispatch({ type: 'ERROR', error: `Could not start the download. ${errorMessage(e)}` });
    }
  }, []);

  const downloadReport = useCallback(() => {
    const s = stateRef.current;
    if (!s.generated || !s.cart) return;
    try {
      saveBlob(
        buildReportText(s.generated, s.cart.title),
        'text/plain;charset=utf-8',
        reportFilename(s.cart.courseCode, s.cart.title),
      );
      dispatch({ type: 'STATUS', status: STATUS.reportSaved });
    } catch (e) {
      dispatch({ type: 'ERROR', error: `Could not start the download. ${errorMessage(e)}` });
    }
  }, []);

  const notePrinted = useCallback(() => {
    if (!currentBrowserIsChromium()) dispatch({ type: 'PRINT_NOTICE' });
  }, []);

  const dismissNotice = useCallback((code: NoticeCode) => dispatch({ type: 'DISMISS', code }), []);

  // -- derived --------------------------------------------------------------

  const stale = state.generated !== null && state.generatedKey !== key;
  const guardArmed = state.cart !== null && !(state.generated !== null && state.downloaded);

  const options = useMemo(() => docOptions(state), [
    state.presentation,
    state.palette,
    state.showCover,
    state.showToc,
    state.pageBreaks,
    state.language,
  ]);

  const cover = useMemo<CoverInfo>(
    () => (state.cart ? coverInfo(state, state.cart, false) : { courseTitle: '' }),
    [state.cart, state.cover, state.includeLogo],
  );

  const notices = useMemo<NoticeCode[]>(() => {
    if (state.generated && !stale) return visibleNotices(state.generated.notices, state);
    if (state.livePreview && state.livePreview.key === key) return visibleNotices(state.livePreview.doc.notices, state);
    const codes: NoticeCode[] = [];
    for (const id of state.selected) codes.push(...(state.pageNotices[id] ?? []));
    return visibleNotices(codes, state);
  }, [state.generated, stale, state.livePreview, key, state.selected, state.pageNotices, state.dismissed, state.presentation]);

  const previewCss = useMemo(
    () => (state.cart ? safeThemeCss(state.presentation, state.palette) : ''),
    [state.cart, state.presentation, state.palette],
  );
  const previewTitle = state.preview && state.preview.resourceId === state.focusedId ? state.preview.title : null;
  const previewSrcdoc = useMemo(() => {
    const p = state.preview;
    if (!p || p.resourceId !== state.focusedId) return null;
    return buildPreviewSrcdoc({
      title: p.title,
      sectionId: p.sectionId,
      kind: p.kind,
      presentation: state.presentation,
      html: state.presentation === 'original' ? p.original : p.neutral,
      css: previewCss,
      language: state.language || 'en',
    });
  }, [state.preview, state.focusedId, state.presentation, previewCss, state.language]);

  // The pane never blanks between updates: the last document stays on screen
  // (even when its key is out of date) until the rebuilt one lands. Only an
  // empty selection or a new course export (which clears `livePreview`) removes it.
  const livePreviewSrcdoc = state.livePreview && state.selected.length > 0 ? state.livePreview.doc.html : null;
  const livePreviewUpdating = livePending || state.livePreviewLoading;

  const actions = useMemo<SyllabusActions>(
    () => ({
      loadFile,
      reset,
      showError,
      clearError,
      select,
      selectMany,
      move,
      remove,
      setKindHidden,
      focus,
      setOptions,
      setCover,
      setIncludeLogo,
      generate,
      download,
      downloadReport,
      notePrinted,
      dismissNotice,
    }),
    [
      loadFile,
      reset,
      showError,
      clearError,
      select,
      selectMany,
      move,
      remove,
      setKindHidden,
      focus,
      setOptions,
      setCover,
      setIncludeLogo,
      generate,
      download,
      downloadReport,
      notePrinted,
      dismissNotice,
    ],
  );

  return {
    state,
    counts,
    hiddenKinds,
    selectedSet,
    options,
    cover,
    notices,
    previewSrcdoc,
    previewTitle,
    livePreviewSrcdoc,
    livePreviewUpdating,
    filename,
    stale,
    guardArmed,
    actions,
  };
}
