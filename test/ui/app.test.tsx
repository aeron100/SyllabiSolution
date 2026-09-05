/**
 * The wizard end to end under jsdom: a dropped file (and, dev-only, ?load=)
 * lands on step 2 and announces the page count, Next/Generate/Back/strip
 * navigation moves focus to each step heading, Generate builds a document
 * with the inlined Coastline logo on the cover, and Start over returns to
 * the hero. The only fetch the app ever makes is the dev-only ?load= aid.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { App, START_OVER_LABEL } from '../../src/App';
import { REASSURANCE, STATUS } from '../../src/ui/copy';
import { buildSample } from '../fixtures/make-sample.mjs';

/** A fresh copy so the bytes sit on a plain ArrayBuffer (what File accepts). */
const SAMPLE: Uint8Array<ArrayBuffer> = new Uint8Array(buildSample());

function fakeResponse(bytes: Uint8Array, type: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: async () => bytes.slice().buffer,
  } as unknown as Response;
}

/** Only the dev-only ?load= aid may fetch, and only the URL it was given. */
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/sample.imscc')) return fakeResponse(SAMPLE, 'application/octet-stream');
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

/** The real user path: drop a course export on the hero sheet (File API only). */
function dropSample(host: HTMLElement): void {
  const sheet = host.querySelector('.hero-drop')!;
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { files: [new File([SAMPLE], 'sample.imscc')], dropEffect: 'copy' } });
  act(() => {
    sheet.dispatchEvent(ev);
  });
}

async function waitFor(check: () => boolean, ms = 10_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('waitFor: timed out');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
}

function tileByText(host: HTMLElement, text: string): HTMLButtonElement {
  const all = Array.from(host.querySelectorAll<HTMLButtonElement>('button.tile'));
  const hit = all.find((b) => b.querySelector('.tile-label')?.textContent?.trim() === text);
  if (!hit) throw new Error(`no tile "${text}"`);
  return hit;
}

function heading(step: number): HTMLElement | null {
  return document.getElementById(`wizard-step-${step}-heading`);
}

/** The heading outline must start at the one h1 (the app name) and never skip a level. */
function expectHeadingOutline(): void {
  const levels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => Number(h.tagName[1]));
  expect(levels[0]).toBe(1);
  expect(levels.filter((l) => l === 1).length).toBe(1);
  for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
}

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** axe over the whole app document (jsdom has no layout, so colour contrast is checked elsewhere). */
async function violations(): Promise<string[]> {
  const result = await axe.run(document, {
    runOnly: { type: 'tag', values: WCAG_TAGS },
    rules: { 'color-contrast': { enabled: false } },
    iframes: false,
  });
  return result.violations.map((v) => `${v.id} [${v.impact}]: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('App (static)', () => {
  it('renders the hero step with the header, strip, skip link, and live region', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('role="banner"');
    // The app name is the page's one h1; step headings are h2 under it.
    expect(html).toMatch(/<h1 class="sg-header-name">Syllabus Generator<\/h1>/);
    expect(html.match(/<h1\b/g)?.length).toBe(1);
    // The logo is inlined at build time, so the header makes no request (DESIGN.md §2, §10).
    expect(html).toContain('src="data:image/svg+xml;base64,');
    expect(html).not.toMatch(/src="(?!data:)/);
    expect(html).toContain('alt="Coastline College"');
    expect(html).toContain('Institutional Effectiveness');
    expect(html).toContain('aria-label="Steps"');
    expect(html).toMatch(/<li[^>]*class="step is-current"[^>]*aria-current="step"/);
    expect(html).toContain('id="wizard-step-1-heading"');
    expect(html).toContain('Skip to main content');
    expect(html).toContain('id="app-status"');
    // §14 always-visible line lives in the persistent footer, so it is on every step.
    expect(html).toContain(REASSURANCE);
    expect(html).not.toContain(START_OVER_LABEL);
    expect(html).not.toContain('<script');
  });
});

describe('App (wizard flow)', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;

  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  beforeEach(() => {
    stubFetch();
    window.scrollTo = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('loads ?load=, lands on step 2, and walks every step with focus on each heading', async () => {
    window.history.replaceState({}, '', '/?load=/sample.imscc');
    root = createRoot(host);
    act(() => root?.render(<App />));

    // Step 2 after the export is read; the count is announced without moving focus.
    await waitFor(() => heading(2) !== null);
    expect(document.getElementById('app-status')?.textContent).toMatch(/^Found \d+ pages? in \d+ modules?\.$/);
    expect(document.activeElement).toBe(heading(2));
    expect(document.title).toBe('Choose pages – Syllabus Generator');
    expectHeadingOutline();
    const current = host.querySelector('li[aria-current="step"]');
    expect(current?.textContent).toContain('Choose pages');
    expect(host.querySelector('.step.is-done button')?.textContent).toContain('Step 1, completed');
    expect(tileByText(host, START_OVER_LABEL)).toBeTruthy();

    // Make sure something is checked (the syllabus is pre-checked when the export has one).
    const rowBoxes = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).filter(
      (b) => b.getAttribute('aria-label')?.startsWith('Include ') && !b.getAttribute('aria-label')?.startsWith('Include all in'),
    );
    expect(rowBoxes.length).toBeGreaterThan(0);
    if (!rowBoxes.some((b) => b.checked)) act(() => rowBoxes[0].click());
    const selectedCount = rowBoxes.filter((b) => b.checked).length;
    expect(host.querySelector('.wizard-nav-count')?.textContent).toBe(`${selectedCount} selected`);

    // Next -> step 3, heading focused, live preview builds itself.
    act(() => tileByText(host, 'Next').click());
    await waitFor(() => heading(3) !== null);
    expect(document.activeElement).toBe(heading(3));
    expect(document.title).toBe('Arrange and style – Syllabus Generator');
    expectHeadingOutline();
    expect(host.querySelector('li[aria-current="step"]')?.textContent).toContain('Arrange and style');
    await waitFor(() => host.querySelector('iframe[title="Live preview"]') !== null);
    expect(host.querySelector('.card-list')?.querySelectorAll('.card-row').length).toBe(selectedCount);
    expect((host.querySelector('#arrange-logo') as HTMLInputElement).checked).toBe(true);

    // Generate -> step 4 with the finished document (logo embedded, no script).
    act(() => tileByText(host, 'Generate syllabus').click());
    await waitFor(() => heading(4) !== null);
    expect(document.activeElement).toBe(heading(4));
    const frame = host.querySelector<HTMLIFrameElement>('iframe[title="Your syllabus"]');
    expect(frame).not.toBeNull();
    const html = frame?.getAttribute('srcdoc') ?? '';
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).toContain('alt="Coastline College"');
    // ?load= is the one fetch (dev aid); the logo never is.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(html).toContain('data-palette="coastline"');
    expect(html).not.toContain('<script');
    expect(host.querySelector('.download-filename')?.textContent).toMatch(/-syllabus\.html$/);
    expect(host.querySelector('#download-first')).not.toBeNull();

    expect(document.title).toBe('Finalize – Syllabus Generator');
    expectHeadingOutline();
    // Notices that mount with the step are static; the one live region stays quiet until something happens.
    expect(host.querySelectorAll('.notice[role="status"]').length).toBe(0);
    expect(host.querySelectorAll('[role="status"],[role="alert"],[aria-live]').length).toBe(1);

    // Dismissing a notice moves focus to a neighbour notice or the step heading, never to <body>.
    const dismissFirst = host.querySelector<HTMLButtonElement>('#download-first .notice-dismiss');
    expect(dismissFirst).not.toBeNull();
    dismissFirst?.focus();
    act(() => dismissFirst?.click());
    expect(host.querySelector('#download-first')).toBeNull();
    const landed = document.activeElement as HTMLElement;
    expect(landed === heading(4) || landed.classList.contains('notice-dismiss')).toBe(true);

    // Download saves, announces "Saved" through the live region, shows the static notice, and
    // disarms the leave guard (Start over then needs no confirm).
    act(() => tileByText(host, 'Save HTML').click());
    await waitFor(() => host.querySelector('#download-saved') !== null);
    expect(document.getElementById('app-status')?.textContent).toBe(STATUS.saved);
    expect(host.querySelector('#download-first')).toBeNull();
    act(() => tileByText(host, 'Accessibility report').click());
    expect(document.getElementById('app-status')?.textContent).toBe(STATUS.reportSaved);

    // Back keeps everything; the strip jumps to any reached step.
    act(() => tileByText(host, 'Back').click());
    await waitFor(() => heading(3) !== null);
    expect(document.activeElement).toBe(heading(3));
    const toStep2 = Array.from(host.querySelectorAll<HTMLButtonElement>('.step.is-done button')).find((b) =>
      b.textContent?.includes('Step 2'),
    );
    expect(toStep2).toBeTruthy();
    act(() => toStep2?.click());
    await waitFor(() => heading(2) !== null);
    expect(host.querySelector('.wizard-nav-count')?.textContent).toBe(`${selectedCount} selected`);
    // Step 4 stays reachable because the document is unchanged.
    const toStep4 = Array.from(host.querySelectorAll<HTMLButtonElement>('.step.is-done button')).find((b) =>
      b.textContent?.includes('Step 4'),
    );
    expect(toStep4).toBeTruthy();
    act(() => toStep4?.click());
    await waitFor(() => heading(4) !== null);

    // Start over from the header returns to the hero; nothing was unsaved, so no confirm.
    act(() => tileByText(host, START_OVER_LABEL).click());
    await waitFor(() => heading(1) !== null);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(heading(1));
    expect(document.title).toBe('Syllabus Generator');
    expectHeadingOutline();
    expect(host.querySelector('li[aria-current="step"]')?.textContent).toContain('Upload');
    expect(host.querySelector('.step.is-done')).toBeNull();
    expect(host.querySelectorAll('button.tile').length).toBeGreaterThan(0);
    expect(() => tileByText(host, START_OVER_LABEL)).toThrow();
  });

  it('has no axe violations on any step (AA + best practice)', async () => {
    document.documentElement.setAttribute('lang', 'en');
    document.title = 'Syllabus Generator';
    root = createRoot(host);
    act(() => root?.render(<App />));
    expect(await violations()).toEqual([]);

    dropSample(host);
    await waitFor(() => heading(2) !== null);
    expect(fetch).not.toHaveBeenCalled();
    const rowBoxes = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).filter(
      (b) => b.getAttribute('aria-label')?.startsWith('Include ') && !b.getAttribute('aria-label')?.startsWith('Include all in'),
    );
    if (!rowBoxes.some((b) => b.checked)) act(() => rowBoxes[0].click());
    // Pick a title so the preview sheet renders too.
    act(() => host.querySelector<HTMLButtonElement>('button.tree-title')?.click());
    await waitFor(() => host.querySelector('iframe.choose-preview-frame') !== null);
    expect(await violations()).toEqual([]);

    act(() => tileByText(host, 'Next').click());
    await waitFor(() => host.querySelector('iframe[title="Live preview"]') !== null);
    expect(await violations()).toEqual([]);

    act(() => tileByText(host, 'Generate syllabus').click());
    await waitFor(() => heading(4) !== null);
    expect(await violations()).toEqual([]);
  });

  it('asks before starting over while work is unsaved, and regenerates only when inputs change', async () => {
    window.history.replaceState({}, '', '/?load=/sample.imscc');
    root = createRoot(host);
    act(() => root?.render(<App />));
    await waitFor(() => heading(2) !== null);
    const rowBoxes = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).filter(
      (b) => b.getAttribute('aria-label')?.startsWith('Include ') && !b.getAttribute('aria-label')?.startsWith('Include all in'),
    );
    if (!rowBoxes.some((b) => b.checked)) act(() => rowBoxes[0].click());

    act(() => tileByText(host, 'Next').click());
    await waitFor(() => heading(3) !== null);
    act(() => tileByText(host, 'Generate syllabus').click());
    await waitFor(() => heading(4) !== null);
    const first = host.querySelector('iframe[title="Your syllabus"]')?.getAttribute('srcdoc') ?? '';
    expect(first).toContain('<nav');

    // Back, change nothing, Generate again: same document, no rebuild.
    act(() => tileByText(host, 'Back').click());
    await waitFor(() => heading(3) !== null);
    act(() => tileByText(host, 'Generate syllabus').click());
    await waitFor(() => heading(4) !== null);
    expect(host.querySelector('iframe[title="Your syllabus"]')?.getAttribute('srcdoc')).toBe(first);

    // Back, turn the table of contents off: the next Generate rebuilds.
    act(() => tileByText(host, 'Back').click());
    await waitFor(() => heading(3) !== null);
    act(() => (host.querySelector('#arrange-toc') as HTMLInputElement).click());
    act(() => tileByText(host, 'Generate syllabus').click());
    await waitFor(() => heading(4) !== null);
    const second = host.querySelector('iframe[title="Your syllabus"]')?.getAttribute('srcdoc') ?? '';
    expect(second).not.toBe(first);
    expect(second).not.toContain('<nav');

    // Unsaved: Start over asks first; declining keeps the document.
    (window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    act(() => tileByText(host, 'Start over').click());
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(heading(4)).not.toBeNull();
  });
});
