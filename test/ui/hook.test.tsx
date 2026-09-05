/**
 * useSyllabus: the state model behind the wizard. Loads the synthetic
 * fixture (built in memory) as a File, exercises selection/options/cover,
 * the generate memo key, the inlined institution logo, the live preview,
 * and reset. The hook never fetches: fetch is stubbed to throw.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '../../src/lib/generate/colors';
import {
  INSTITUTION,
  LIVE_PREVIEW_DELAY_MS,
  LIVE_PREVIEW_LOOK_DELAY_MS,
  useSyllabus,
  type SyllabusModel,
  type UseSyllabusOptions,
} from '../../src/hooks/useSyllabus';
import { LOGO_DATA_URI } from '../../src/ui/assets';
import { STATUS } from '../../src/ui/copy';
import { treeOrder, visibleIds } from '../../src/ui/tree';
import { buildSample } from '../fixtures/make-sample.mjs';

/** A fresh copy so the bytes sit on a plain ArrayBuffer (what File accepts). */
const SAMPLE: Uint8Array<ArrayBuffer> = new Uint8Array(buildSample());

async function waitFor(check: () => boolean, ms = 10_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('waitFor: timed out');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
}

function Harness({ opts, onModel }: { opts: UseSyllabusOptions; onModel: (m: SyllabusModel) => void }) {
  onModel(useSyllabus(opts));
  return null;
}

describe('useSyllabus', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;
  let model!: SyllabusModel;

  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  beforeEach(() => {
    // The app makes no request of its own (DESIGN.md §2): any fetch is a test failure.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('the app must not fetch');
      }),
    );
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host.remove();
    vi.unstubAllGlobals();
  });

  function mount(opts: UseSyllabusOptions = {}): void {
    root = createRoot(host);
    act(() =>
      root?.render(
        <Harness
          opts={opts}
          onModel={(m) => {
            model = m;
          }}
        />,
      ),
    );
  }

  async function loadSample(): Promise<void> {
    act(() => model.actions.loadFile(new File([SAMPLE], 'sample.imscc')));
    await waitFor(() => model.state.cart !== null);
  }

  it('starts empty with the design defaults', () => {
    mount();
    expect(model.state.cart).toBeNull();
    expect(model.options).toEqual({
      presentation: 'styled',
      palette: DEFAULT_PALETTE,
      showCover: true,
      showToc: true,
      pageBreaks: true,
      language: 'en',
    });
    expect(model.state.includeLogo).toBe(true);
    expect(model.guardArmed).toBe(false);
    expect(model.filename).toBe('syllabus.html');
  });

  it('reads a File, announces the count, pre-checks the syllabus, and arms the guard', async () => {
    mount();
    expect(model.state.phase).toBe('empty');
    await loadSample();
    const cart = model.state.cart;
    expect(cart).not.toBeNull();
    expect(model.state.phase).toBe('ready');
    expect(model.state.status).toMatch(/^Found \d+ pages? in \d+ modules?\.$/);
    const syllabi = Array.from(cart!.resources.values()).filter((r) => r.kind === 'syllabus').map((r) => r.id);
    expect(model.state.selected).toEqual(syllabi);
    expect(model.guardArmed).toBe(true);
    expect(model.filename).toMatch(/-syllabus\.html$/);
    expect(model.cover.courseTitle).toBe(cart!.title);
    expect(model.cover.institution).toBe(INSTITUTION);
    expect(Object.values(model.counts).reduce((a, b) => a + (b ?? 0), 0)).toBe(cart!.resources.size);
  });

  it('embeds the inlined logo on the cover synchronously, without any fetch', async () => {
    mount();
    await loadSample();
    expect(model.cover.logoDataUri).toBe(LOGO_DATA_URI);
    expect(model.cover.logoDataUri).toMatch(/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/);
    expect(model.cover.institution).toBe(INSTITUTION);
    act(() => model.actions.setIncludeLogo(false));
    expect(model.cover.institution).toBeUndefined();
    expect(model.cover.logoDataUri).toBeUndefined();
    act(() => model.actions.setIncludeLogo(true));
    expect(model.cover.logoDataUri).toBe(LOGO_DATA_URI);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('selects idempotently, hides kinds, and reorders', async () => {
    mount();
    await loadSample();
    const cart = model.state.cart!;
    const ids = Array.from(cart.resources.keys());
    const first = ids.find((id) => !model.state.selected.includes(id))!;
    act(() => model.actions.select(first, true));
    act(() => model.actions.select(first, true));
    expect(model.state.selected.filter((x) => x === first)).toHaveLength(1);
    const before = model.state.selected.length;
    act(() => model.actions.selectMany(ids, true));
    expect(model.state.selected.length).toBe(ids.length);
    expect(model.state.selected.length).toBeGreaterThanOrEqual(before);
    const [a, b] = model.state.selected;
    act(() => model.actions.move(b, -1));
    expect(model.state.selected.slice(0, 2)).toEqual([a, b].reverse());
    act(() => model.actions.remove(a));
    expect(model.state.selected).not.toContain(a);
    act(() => model.actions.select(a, false));
    expect(model.state.selected).not.toContain(a);
    // Only Syllabus and Pages start shown; hiding is idempotent and un-hiding removes just that kind.
    const initial = Array.from(model.hiddenKinds);
    expect(initial).not.toContain('page');
    expect(initial).not.toContain('syllabus');
    expect(initial).toEqual(expect.arrayContaining(['assignment', 'quiz', 'discussion', 'announcement', 'link', 'tool', 'file', 'other']));
    act(() => model.actions.setKindHidden('page', true));
    act(() => model.actions.setKindHidden('page', true));
    expect(Array.from(model.hiddenKinds)).toEqual([...initial, 'page']);
    act(() => model.actions.setKindHidden('page', false));
    expect(Array.from(model.hiddenKinds)).toEqual(initial);
    for (const k of initial) act(() => model.actions.setKindHidden(k, false));
    expect(model.hiddenKinds.size).toBe(0);
  });

  // DESIGN.md §10: the order of selection is the document order; the syllabus starts at position 1.
  describe('selection order', () => {
    /** Three unselected ids, in reverse tree order, so "append" and "tree order" give different answers. */
    function candidates(): [string, string, string] {
      const cart = model.state.cart!;
      const free = treeOrder(cart).filter((id) => !model.state.selected.includes(id));
      expect(free.length).toBeGreaterThanOrEqual(3);
      return [free[2], free[1], free[0]];
    }

    it('starts with the Canvas syllabus alone at position 1', async () => {
      mount();
      await loadSample();
      const syllabi = Array.from(model.state.cart!.resources.values()).filter((r) => r.kind === 'syllabus');
      expect(syllabi).toHaveLength(1);
      expect(model.state.selected).toEqual([syllabi[0].id]);
    });

    it('check, check, uncheck, re-check: each check appends, an uncheck renumbers the rest', async () => {
      mount();
      await loadSample();
      const [syl] = model.state.selected;
      const [x, y, z] = candidates();
      act(() => model.actions.select(x, true));
      act(() => model.actions.select(y, true));
      act(() => model.actions.select(z, true));
      expect(model.state.selected).toEqual([syl, x, y, z]);
      act(() => model.actions.select(x, false));
      expect(model.state.selected).toEqual([syl, y, z]);
      act(() => model.actions.select(x, true));
      expect(model.state.selected).toEqual([syl, y, z, x]);
      // Even the pre-checked syllabus goes to the end when re-checked.
      act(() => model.actions.select(syl, false));
      act(() => model.actions.select(syl, true));
      expect(model.state.selected).toEqual([y, z, x, syl]);
    });

    it('selectMany appends the missing ids in tree order after the existing order; removing keeps the rest in order', async () => {
      mount();
      await loadSample();
      const [syl] = model.state.selected;
      const [x, y, z] = candidates(); // reverse tree order
      act(() => model.actions.select(z, true));
      act(() => model.actions.select(x, true));
      // "Select all shown" hands over ids in tree order, with some already checked.
      act(() => model.actions.selectMany([z, y, x], true));
      expect(model.state.selected).toEqual([syl, z, x, y]);
      act(() => model.actions.selectMany([syl, x], false));
      expect(model.state.selected).toEqual([z, y]);
      // A module's checkbox: the whole tree, appended in tree order after what is there.
      const all = treeOrder(model.state.cart!);
      act(() => model.actions.selectMany(all, true));
      expect(model.state.selected).toEqual([z, y, ...all.filter((id) => id !== z && id !== y)]);
    });

    it('"Select all shown" with a kind hidden appends only the shown ids; "Clear shown" leaves a hidden selection in place', async () => {
      mount();
      await loadSample();
      const cart = model.state.cart!;
      const order = treeOrder(cart);
      const [syl] = model.state.selected;
      // Start from every kind shown, so only the deliberate "hide pages" below affects what is shown.
      for (const k of Array.from(model.hiddenKinds)) act(() => model.actions.setKindHidden(k, false));
      const page = order.find((id) => cart.resources.get(id)?.kind === 'page')!;
      const assign = order.find((id) => cart.resources.get(id)?.kind === 'assignment')!;
      act(() => model.actions.select(assign, true));
      act(() => model.actions.select(page, true));
      expect(model.state.selected).toEqual([syl, assign, page]);
      // Hide pages; the step hands over the visible ids in tree order.
      act(() => model.actions.setKindHidden('page', true));
      const shown = visibleIds(cart, order, model.hiddenKinds);
      expect(shown).not.toContain(page);
      act(() => model.actions.selectMany(shown, true));
      expect(model.state.selected).toEqual([syl, assign, page, ...shown.filter((id) => id !== syl && id !== assign)]);
      expect(new Set(model.state.selected).size).toBe(model.state.selected.length);
      // Clear shown: the hidden page keeps its selection.
      act(() => model.actions.selectMany(shown, false));
      expect(model.state.selected).toEqual([page]);
    });

    it('a step-3 move makes the generated document stale; moving back makes it current again', async () => {
      mount();
      await loadSample();
      const [x] = candidates();
      act(() => model.actions.select(x, true));
      await act(async () => {
        await model.actions.generate();
      });
      expect(model.stale).toBe(false);
      act(() => model.actions.move(x, -1));
      expect(model.state.selected[0]).toBe(x);
      expect(model.stale).toBe(true);
      act(() => model.actions.move(x, 1));
      expect(model.stale).toBe(false);
    });

    it('a step-3 move is the same list step 2 reads, and later checks append after the moved order', async () => {
      mount();
      await loadSample();
      const [syl] = model.state.selected;
      const [x, y, z] = candidates();
      act(() => model.actions.select(x, true));
      act(() => model.actions.select(y, true));
      act(() => model.actions.move(y, -1));
      act(() => model.actions.move(y, -1));
      expect(model.state.selected).toEqual([y, syl, x]);
      expect(Array.from(model.selectedSet)).toEqual([y, syl, x]);
      act(() => model.actions.select(z, true));
      expect(model.state.selected).toEqual([y, syl, x, z]);
      act(() => model.actions.move(syl, 1));
      expect(model.state.selected).toEqual([y, x, syl, z]);
      act(() => model.actions.remove(x));
      expect(model.state.selected).toEqual([y, syl, z]);
    });
  });

  it('applies option and cover patches, normalising the language tag', async () => {
    mount();
    await loadSample();
    act(() => model.actions.setOptions({ presentation: 'original' }));
    expect(model.options.presentation).toBe('original');
    act(() => model.actions.setOptions({ presentation: 'styled', palette: 'ink-paper' }));
    expect(model.options).toMatchObject({ presentation: 'styled', palette: 'ink-paper' });
    act(() => model.actions.setOptions({ language: 'es-MX', showToc: false }));
    expect(model.options.language).toBe('es');
    expect(model.options.showToc).toBe(false);
    act(() => model.actions.setCover({ instructor: '  Dr. Ada Lovelace ', courseTitle: 'ignored' }));
    expect(model.cover.instructor).toBe('  Dr. Ada Lovelace ');
    expect(model.cover.courseTitle).toBe(model.state.cart!.title);
  });

  it('generates once per input set and reports staleness', async () => {
    mount();
    await loadSample();
    act(() => model.actions.setCover({ instructor: ' Dr. Ada Lovelace ' }));
    let doc = null as Awaited<ReturnType<SyllabusModel['actions']['generate']>>;
    await act(async () => {
      doc = await model.actions.generate();
    });
    expect(doc).not.toBeNull();
    expect(doc!.html).toContain('Dr. Ada Lovelace');
    expect(doc!.html).toContain('data:image/svg+xml;base64,');
    expect(doc!.html).not.toContain('<script');
    expect(model.state.generated).toBe(doc);
    expect(model.stale).toBe(false);
    let again = null as typeof doc;
    await act(async () => {
      again = await model.actions.generate();
    });
    expect(again).toBe(doc);
    act(() => model.actions.setOptions({ pageBreaks: false }));
    expect(model.stale).toBe(true);
    let rebuilt = null as typeof doc;
    await act(async () => {
      rebuilt = await model.actions.generate();
    });
    expect(rebuilt).not.toBe(doc);
    expect(rebuilt!.html).not.toBe(doc!.html);
    expect(model.stale).toBe(false);
    expect(model.state.progress).toBeNull();
  });

  it('builds the live preview while step 3 is active and reuses it for Generate', async () => {
    mount({ livePreview: true });
    await loadSample();
    await waitFor(() => model.livePreviewSrcdoc !== null);
    expect(model.state.livePreviewLoading).toBe(false);
    const preview = model.livePreviewSrcdoc;
    let doc = null as Awaited<ReturnType<SyllabusModel['actions']['generate']>>;
    await act(async () => {
      doc = await model.actions.generate();
    });
    expect(doc!.html).toBe(preview);
    expect(model.livePreviewUpdating).toBe(false);
    act(() => model.actions.setOptions({ palette: 'jade-gold' }));
    // The old document stays on screen, flagged as updating, until the new one lands.
    expect(model.livePreviewSrcdoc).toBe(preview);
    expect(model.livePreviewUpdating).toBe(true);
    await waitFor(() => model.livePreviewSrcdoc !== preview);
    expect(model.livePreviewSrcdoc).toContain('data-palette="jade-gold"');
    expect(model.livePreviewUpdating).toBe(false);
  });

  it('rebuilds the live preview within 50 ms of a look change without reprocessing, and 300 ms after a cover edit', async () => {
    mount({ livePreview: true });
    await loadSample();
    await waitFor(() => model.livePreviewSrcdoc !== null);
    // Reprocessing a page means extracting it from the zip again; a cached
    // ProcessedPage never touches the zip. So: no zip reads = no reprocessing.
    const zip = model.state.cart!.zip;
    const reads = [vi.spyOn(zip, 'text'), vi.spyOn(zip, 'bytes')];
    const notReprocessed = (): void => {
      for (const r of reads) expect(r).not.toHaveBeenCalled();
    };
    expect(LIVE_PREVIEW_LOOK_DELAY_MS).toBeLessThanOrEqual(50);
    expect(LIVE_PREVIEW_DELAY_MS).toBe(300);

    vi.useFakeTimers();
    try {
      // A palette change: the old document stays on screen, flagged as updating,
      // and the rebuilt one lands within ~60 ms straight from the page cache.
      const first = model.livePreviewSrcdoc;
      act(() => model.actions.setOptions({ palette: 'jade-gold' }));
      expect(model.livePreviewSrcdoc).toBe(first);
      expect(model.livePreviewUpdating).toBe(true);
      expect(model.state.liveReason).toBe('look');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      expect(model.livePreviewSrcdoc).toBe(first);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40);
      });
      expect(model.livePreviewSrcdoc).not.toBe(first);
      expect(model.livePreviewSrcdoc).toContain('data-palette="jade-gold"');
      expect(model.livePreviewUpdating).toBe(false);
      notReprocessed();

      // The layout toggles are looks too.
      const second = model.livePreviewSrcdoc;
      act(() => model.actions.setOptions({ showToc: false }));
      expect(model.state.liveReason).toBe('look');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
      expect(model.livePreviewSrcdoc).not.toBe(second);
      expect(model.livePreviewUpdating).toBe(false);
      notReprocessed();

      // A cover edit waits the full 300 ms (typing), still without reprocessing.
      const third = model.livePreviewSrcdoc;
      act(() => model.actions.setCover({ instructor: 'Dr. Grace Hopper' }));
      expect(model.livePreviewSrcdoc).toBe(third);
      expect(model.livePreviewUpdating).toBe(true);
      expect(model.state.liveReason).toBe('content');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(model.livePreviewSrcdoc).toBe(third);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(70);
      });
      expect(model.livePreviewSrcdoc).not.toBe(third);
      expect(model.livePreviewSrcdoc).toContain('Dr. Grace Hopper');
      expect(model.livePreviewUpdating).toBe(false);
      notReprocessed();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed live build shows its error and leaves the pane quiet (not busy); the next edit retries', async () => {
    mount({ livePreview: true });
    await loadSample();
    await waitFor(() => model.livePreviewSrcdoc !== null && !model.livePreviewUpdating);
    const old = model.livePreviewSrcdoc;

    // Deterministic failure: an id the export does not have makes getProcessed throw.
    act(() => model.actions.select('no-such-page', true));
    expect(model.livePreviewUpdating).toBe(true);
    await waitFor(() => model.state.error !== null);
    expect(model.state.error).toMatch(/^Could not build the preview\./);
    expect(model.state.livePreviewLoading).toBe(false);
    expect(model.livePreviewSrcdoc).toBe(old); // the old document stays on the sheet
    // Nothing is scheduled or in flight, so the pane must not claim to be updating — now or later.
    expect(model.livePreviewUpdating).toBe(false);
    await act(async () => {
      await new Promise((r) => setTimeout(r, LIVE_PREVIEW_DELAY_MS + 100));
    });
    expect(model.livePreviewUpdating).toBe(false);
    expect(model.state.livePreviewLoading).toBe(false);

    // Any edit retries (and fails again while the bad page is still in) …
    act(() => model.actions.clearError());
    act(() => model.actions.setCover({ instructor: 'Dr. Retry' }));
    expect(model.livePreviewUpdating).toBe(true);
    await waitFor(() => model.state.error !== null);
    expect(model.livePreviewUpdating).toBe(false);
    // … and recovers as soon as the inputs can be built.
    act(() => model.actions.select('no-such-page', false));
    expect(model.livePreviewUpdating).toBe(true);
    await waitFor(() => model.livePreviewSrcdoc !== old);
    expect(model.livePreviewSrcdoc).toContain('Dr. Retry');
    expect(model.livePreviewUpdating).toBe(false);
    expect(model.state.livePreviewLoading).toBe(false);
  });

  it('drops a live build whose inputs were reverted mid-flight and does not leave the pane busy', async () => {
    mount({ livePreview: true });
    await loadSample();
    await waitFor(() => model.livePreviewSrcdoc !== null && !model.livePreviewUpdating);
    const shown = model.livePreviewSrcdoc!;
    const shownKey = model.state.livePreview!.key;
    const cart = model.state.cart!;
    const extra = Array.from(cart.resources.keys()).find((id) => !model.state.selected.includes(id))!;
    const extraSection = `id="sec-${extra}"`;
    expect(shown).not.toContain(extraSection);

    // Slow zip reads so the cache-miss build is observably in flight.
    const zip = cart.zip;
    const text = zip.text.bind(zip);
    const bytes = zip.bytes.bind(zip);
    const slow = <T,>(p: Promise<T>): Promise<T> => new Promise((r) => setTimeout(() => r(p), 150));
    vi.spyOn(zip, 'text').mockImplementation((...a: Parameters<typeof text>) => slow(text(...a)));
    vi.spyOn(zip, 'bytes').mockImplementation((...a: Parameters<typeof bytes>) => slow(bytes(...a)));

    // Add a page (content: 300 ms, then a real cache miss → async processing) …
    act(() => model.actions.select(extra, true));
    await waitFor(() => model.state.livePreviewLoading);
    expect(model.livePreviewUpdating).toBe(true);
    // … and take it out again while that build is in flight: the inputs match the document on screen.
    act(() => model.actions.select(extra, false));
    expect(model.state.selected).not.toContain(extra);
    expect(model.state.livePreviewLoading).toBe(false);
    expect(model.livePreviewUpdating).toBe(false);

    // The in-flight build is never shown, and nothing else is rebuilt.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(model.state.livePreview!.key).toBe(shownKey);
    expect(model.livePreviewSrcdoc).toBe(shown);
    expect(model.livePreviewSrcdoc).not.toContain(extraSection);
    expect(model.state.livePreviewLoading).toBe(false);
    expect(model.livePreviewUpdating).toBe(false);
  });

  it('Generate with a current document during a pending live rebuild returns it at once and lets the rebuild finish', async () => {
    mount({ livePreview: true });
    await loadSample();
    await waitFor(() => model.livePreviewSrcdoc !== null && !model.livePreviewUpdating);
    let doc = null as Awaited<ReturnType<SyllabusModel['actions']['generate']>>;
    await act(async () => {
      doc = await model.actions.generate();
    });
    expect(doc).not.toBeNull();
    expect(model.stale).toBe(false);

    // A look change lands in the live preview …
    act(() => model.actions.setOptions({ palette: 'jade-gold' }));
    await waitFor(() => !model.livePreviewUpdating);
    expect(model.livePreviewSrcdoc).toContain('data-palette="jade-gold"');
    // … and is reverted: the generated document is current again while the live preview still has to catch up.
    act(() => model.actions.setOptions({ palette: DEFAULT_PALETTE }));
    expect(model.stale).toBe(false);
    expect(model.livePreviewUpdating).toBe(true);
    let again = null as typeof doc;
    await act(async () => {
      again = await model.actions.generate();
    });
    expect(again).toBe(doc);
    // The scheduled rebuild still runs to completion; the pane does not stay busy.
    await waitFor(() => !model.livePreviewUpdating);
    expect(model.livePreviewSrcdoc).toContain(`data-palette="${DEFAULT_PALETTE}"`);
    expect(model.state.livePreviewLoading).toBe(false);
  });

  it('reset clears the course export; the next export gets the logo again', async () => {
    mount();
    await loadSample();
    act(() => model.actions.reset());
    expect(model.state.cart).toBeNull();
    expect(model.state.selected).toEqual([]);
    expect(model.guardArmed).toBe(false);
    await loadSample();
    expect(model.cover.logoDataUri).toBe(LOGO_DATA_URI);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reset during generation leaves no document behind', async () => {
    mount();
    await loadSample();
    const ids = Array.from(model.state.cart!.resources.keys());
    act(() => model.actions.selectMany(ids, true));
    let p: Promise<unknown> | null = null;
    act(() => {
      p = model.actions.generate();
    });
    expect(model.state.phase).toBe('generating');
    act(() => model.actions.reset());
    await act(async () => {
      await p;
    });
    expect(model.state.generated).toBeNull();
    expect(model.state.phase).toBe('empty');
    expect(model.state.error).toBeNull();
    expect(model.state.progress).toBeNull();
  });

  it('generate with every page removed returns null and keeps the old document', async () => {
    mount();
    await loadSample();
    await act(async () => {
      await model.actions.generate();
    });
    const old = model.state.generated;
    expect(old).not.toBeNull();
    for (const id of [...model.state.selected]) act(() => model.actions.remove(id));
    expect(model.state.selected).toEqual([]);
    expect(model.stale).toBe(true);
    let r: unknown = 1;
    await act(async () => {
      r = await model.actions.generate();
    });
    expect(r).toBeNull();
    expect(model.state.generated).toBe(old);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('download announces "Saved" through the status line, and the report download "Report saved"', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    mount();
    await loadSample();
    await act(async () => {
      await model.actions.generate();
    });
    expect(model.guardArmed).toBe(true);
    act(() => model.actions.download());
    expect(click).toHaveBeenCalledTimes(1);
    expect(model.state.downloaded).toBe(true);
    expect(model.state.status).toBe(STATUS.saved);
    expect(model.guardArmed).toBe(false);
    // A second save re-announces (the text is varied so an atomic region reads it again).
    act(() => model.actions.download());
    expect(model.state.status).not.toBe(STATUS.saved);
    expect(model.state.status.trim()).toBe(STATUS.saved);
    act(() => model.actions.downloadReport());
    expect(click).toHaveBeenCalledTimes(3);
    expect(model.state.status).toBe(STATUS.reportSaved);
    click.mockRestore();
  });

  it('reports a read error without announcing it twice', async () => {
    mount();
    act(() => model.actions.loadFile(new File([new Uint8Array([1, 2, 3])], 'broken.imscc')));
    await waitFor(() => model.state.error !== null);
    expect(model.state.error).toMatch(/^Could not read that course export\./);
    expect(model.state.status).toBe('');
    expect(model.state.phase).toBe('empty');
    act(() => model.actions.clearError());
    expect(model.state.error).toBeNull();
  });
});
