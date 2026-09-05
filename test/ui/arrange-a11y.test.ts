/**
 * Accessibility and design contract for Step 3 — Arrange and style (DESIGN.md §9a, §10).
 *
 * 1. axe-core over a static render of ArrangeStep in four visual states.
 * 2. Structural facts the a11y claims rest on: the heading outline, the busy
 *    state and the placement of the live region, the iframe's sandbox and
 *    title, the checked look tile, control target sizes from tokens.
 * 3. Stylesheet facts read straight from the CSS text: the sticky preview
 *    exists only inside the ≥ 992 px block and in its own grid column (2.4.11
 *    focus not obscured), no overflow on its ancestors, reduced-motion
 *    coverage, no hard-coded colors in arrange.css.
 * 4. The sandbox claim: a document assembled from hostile sections and cover
 *    fields contains no script, handler, or script URL, so the preview's
 *    `sandbox="allow-same-origin"` without `allow-scripts` is safe.
 *
 * jsdom has no layout, so color-contrast is disabled here (proven from tokens
 * in test/ui/tokens.test.ts) and target sizes are checked from the tokens.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cartridge, CoverInfo, DocOptions, Kind, ProcessedPage, Resource, ZipIndex } from '../../src/lib/types';
import ArrangeStep, { type ArrangeStepProps } from '../../src/steps/ArrangeStep';
import { assembleDocument } from '../../src/lib/generate/assemble';

const ROOT = process.cwd();
const arrangeCss = readFileSync(resolve(ROOT, 'src/steps/ArrangeStep/arrange.css'), 'utf8');
const appCss = readFileSync(resolve(ROOT, 'src/styles/app.css'), 'utf8');
const tokensCss = readFileSync(resolve(ROOT, 'src/styles/tokens.css'), 'utf8');

const zip: ZipIndex = {
  names: () => [],
  has: () => false,
  resolve: () => null,
  size: () => undefined,
  bytes: () => Promise.reject(new Error('no zip')),
  text: () => Promise.reject(new Error('no zip')),
};

function resource(id: string, title: string, kind: Kind): Resource {
  return { id, type: 'webcontent', files: [], dependencies: [], kind, title, meta: {} };
}

const IDS = ['r-syllabus', 'r-welcome', 'r-quiz', 'r-assign', 'r-disc'] as const;

function makeCart(): Cartridge {
  const list = [
    resource(IDS[0], 'Syllabus', 'syllabus'),
    resource(IDS[1], 'Welcome & Overview', 'page'),
    resource(IDS[2], 'Quiz 1', 'quiz'),
    resource(IDS[3], 'Assignment: Essay', 'assignment'),
    resource(IDS[4], 'Discussion: Introductions', 'discussion'),
  ];
  return {
    title: 'Fundamentals of Data Structures',
    courseCode: 'ICS 123',
    term: 'Fall 2026',
    version: '1.1.0',
    source: 'canvas',
    items: [],
    resources: new Map(list.map((r) => [r.id, r])),
    unfiled: [],
    assignmentGroups: [],
    zip,
  };
}

const COVER: CoverInfo = {
  courseTitle: 'Fundamentals of Data Structures',
  courseCode: 'ICS 123',
  term: 'Fall 2026',
  instructor: 'Ada Lovelace',
  email: 'ada@coastline.edu',
  officeHours: 'Tue 2–4 pm',
};
const OPTIONS: DocOptions = { presentation: 'styled', palette: 'sapphire-brass', showCover: true, showToc: true, pageBreaks: false, language: 'en' };
const SRCDOC = '<!doctype html><html lang="en"><head><title>Syllabus</title></head><body><h1>Syllabus</h1><p>preview</p></body></html>';

function makeProps(over: Partial<ArrangeStepProps> = {}): ArrangeStepProps {
  return {
    cart: makeCart(),
    order: [...IDS],
    onMove: vi.fn(),
    onRemove: vi.fn(),
    cover: COVER,
    onCover: vi.fn(),
    options: OPTIONS,
    onOptions: vi.fn(),
    includeLogo: true,
    onIncludeLogo: vi.fn(),
    livePreviewSrcdoc: SRCDOC,
    livePreviewLoading: false,
    onBack: vi.fn(),
    onGenerate: vi.fn(),
    ...over,
  };
}

const hosts: HTMLElement[] = [];
afterEach(() => {
  while (hosts.length) hosts.pop()!.remove();
});

/** Mount the static markup under an h1 so heading-order rules see the real outline. */
function mountStatic(props: ArrangeStepProps): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = `<header><h1>Syllabus Generator</h1></header><main>${renderToStaticMarkup(createElement(ArrangeStep, props))}</main>`;
  document.body.appendChild(host);
  hosts.push(host);
  return host;
}

async function runAxe(host: HTMLElement): Promise<axe.AxeResults> {
  return axe.run(host, {
    iframes: false,
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    rules: {
      // jsdom has no layout; contrast is proven from tokens in test/ui/tokens.test.ts.
      'color-contrast': { enabled: false },
      // The srcdoc iframe is the generated document, audited separately.
      'frame-tested': { enabled: false },
      // The step is mounted alone; the app shell provides the landmarks and skip link.
      region: { enabled: false },
    },
  });
}

function describeViolations(r: axe.AxeResults): string {
  return r.violations
    .map((v) => `${v.id} [${v.impact}]: ${v.help}\n` + v.nodes.map((n) => `  - ${n.target.join(' ')}: ${n.failureSummary}`).join('\n'))
    .join('\n');
}

/** The rule text of one CSS block at the given selector (first match), or null. */
function block(css: string, selector: string): string | null {
  const i = css.indexOf(selector);
  if (i < 0) return null;
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('ArrangeStep under axe-core (WCAG 2.x A/AA + best-practice)', () => {
  for (const [name, over] of [
    ['ready, preview shown', {}],
    ['updating (aria-busy)', { livePreviewLoading: true }],
    ['empty selection', { order: [], livePreviewSrcdoc: undefined }],
    ['original look, cover off, generating', { options: { ...OPTIONS, presentation: 'original', showCover: false }, generating: true, progress: { done: 1, total: 5 } }],
  ] as const) {
    it(`no violations: ${name}`, async () => {
      const host = mountStatic(makeProps(over as Partial<ArrangeStepProps>));
      const r = await runAxe(host);
      expect(r.violations, describeViolations(r)).toEqual([]);
    });
  }
});

describe('ArrangeStep structure', () => {
  it('heading outline h1 → h2 (step) → h3 for all five sections; Layout and Cover are legends that hold their heading', () => {
    const host = mountStatic(makeProps());
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => Number(h.tagName[1]));
    expect(levels).toEqual([1, 2, 3, 3, 3, 3, 3]);
    expect(Array.from(host.querySelectorAll('h3')).map((h) => h.textContent)).toEqual(['Look', 'Preview', 'Layout', 'Your syllabus', 'Cover']);
    expect(Array.from(host.querySelectorAll('legend')).map((l) => l.textContent)).toEqual(['Layout', 'Cover']);
    expect(host.querySelectorAll('legend > h3')).toHaveLength(2);
    // The heading inside the legend takes the legend's type (visually identical to the other column titles).
    expect(block(appCss, '.wizard-col-title > h3 {')).toContain('font: inherit');
  });

  it('iframe: titled, allow-same-origin only, referrer suppressed; kept in place while updating', () => {
    const host = mountStatic(makeProps({ livePreviewLoading: true }));
    const frame = host.querySelector('iframe')!;
    expect(frame.getAttribute('title')).toBe('Live preview');
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('srcdoc')).toBe(SRCDOC);
  });

  it('busy state: aria-busy on the part being replaced only; the polite status region is a sibling, never inside a busy subtree', () => {
    const busy = mountStatic(makeProps({ livePreviewLoading: true }));
    const doc = busy.querySelector('.arrange-preview-doc')!;
    const status = busy.querySelector('[role="status"].arrange-preview-status')!;
    expect(doc.getAttribute('aria-busy')).toBe('true');
    expect(Array.from(busy.querySelectorAll('[aria-busy]'))).toEqual([doc]);
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(doc.contains(status)).toBe(false);
    expect(status.parentElement).toBe(doc.parentElement);
    expect(busy.querySelectorAll('[aria-busy] [aria-live], [aria-busy] [role="status"]')).toHaveLength(0);
    // The chip is delayed (see arrange.test.tsx), so the static busy markup carries no status text yet.
    expect(status.textContent).toBe('');

    const ready = mountStatic(makeProps());
    expect(ready.querySelector('[aria-busy]')).toBeNull();
    // The region persists (so the next chip is a change), and is empty.
    expect(ready.querySelector('[role="status"].arrange-preview-status')!.textContent).toBe('');
  });

  it('checked look tile: aria-checked drives BOTH a border color change and a visible check icon (not color alone)', () => {
    const host = mountStatic(makeProps());
    const checked = host.querySelectorAll('[role="radio"][aria-checked="true"]');
    expect(checked).toHaveLength(1);
    expect(checked[0].querySelector('.tile-choice-check .bi-check-lg')).not.toBeNull();
    // Stylesheet: border color swaps to the accent and the check slot becomes visible.
    expect(block(appCss, ".tile-choice[aria-checked='true'] {")).toContain('--tile-border: var(--sg-accent)');
    expect(block(appCss, ".tile-choice[aria-checked='true'] .tile-choice-check")).toContain('visibility: visible');
    expect(block(appCss, '.tile-choice {')).toContain('border-width: 3px');
    // Accent and accent-fg are defined in both themes and differ from the unchecked border token.
    for (const theme of [":root,\n[data-bs-theme='light']", "[data-bs-theme='dark']"]) {
      const b = block(tokensCss, theme)!;
      expect(b).toMatch(/--sg-accent: var\(--sg-(navy|blue-1)\)/);
      expect(b).toMatch(/--sg-accent-fg: #/);
      expect(b).toMatch(/--sg-border-strong: #/);
    }
  });

  it('target sizes: every tile/input/select/radio class resolves to ≥ 44 px via tokens', () => {
    const tokens = block(tokensCss, ":root,\n[data-bs-theme='light']")!;
    expect(tokens).toContain('--sg-tile-sm: 2.75rem');
    expect(tokens).toContain('--sg-control: 2.75rem');
    expect(block(appCss, '.tile-sm {')).toContain('min-height: var(--sg-tile-sm)');
    expect(block(appCss, '.tile-icon-only {')).toContain('width: var(--sg-tile-sm)');
    expect(block(appCss, '.tile-choice {')).toContain('min-height: var(--sg-tile-lg)');
    expect(block(appCss, '.form-control,\n.form-select {')).toContain('min-height: var(--sg-control)');
    expect(block(appCss, '.switch-row {')).toContain('min-height: var(--sg-tile-sm)');
    const host = mountStatic(makeProps());
    for (const b of Array.from(host.querySelectorAll('.card-actions button'))) {
      expect(b.className).toMatch(/\btile-sm\b/);
      expect(b.className).toMatch(/\btile-icon-only\b/);
      expect(b.getAttribute('aria-label')).toBeTruthy();
    }
    // Edge tiles are inert but focusable (aria-disabled), never disabled.
    expect(host.querySelectorAll('[disabled]')).toHaveLength(0);
  });
});

describe('ArrangeStep stylesheet facts', () => {
  it('sticky preview exists only inside the ≥ 992 px block, in its own grid column, align-self start', () => {
    const wide = arrangeCss.slice(arrangeCss.indexOf('@media (min-width: 992px)'));
    const narrow = arrangeCss.slice(0, arrangeCss.indexOf('@media (min-width: 992px)'));
    expect(narrow).not.toContain('position: sticky');
    expect(narrow).not.toContain('position: fixed');
    const sticky = block(wide, '.arrange-area-preview {')!;
    expect(sticky).toContain('position: sticky');
    expect(sticky).toContain('top: var(--sg-space-4)');
    expect(sticky).toContain('align-self: start');
    // Two tracks; the preview area spans every row of the right track.
    expect(wide).toContain('grid-template-columns: minmax(0, 42fr) minmax(0, 58fr)');
    expect(wide).toMatch(/'look preview'\s+'toggles preview'\s+'list preview'\s+'cover preview'/);
    // Nothing in the left column is placed in the preview area; no z-index games.
    expect(arrangeCss).not.toContain('z-index');
  });

  it('no overflow on any ancestor between .arrange-area-preview and the viewport (sticky actually works)', () => {
    for (const sel of ['.wizard {', '.wizard-step {', '.wizard-body {', '.wizard-columns {', '.app-main {', '.app {']) {
      const b = block(appCss, sel);
      expect(b, sel).not.toBeNull();
      expect(b, sel).not.toMatch(/overflow\s*:/);
    }
    // The wizard has no sticky header competing for the top edge.
    expect(block(appCss, '.sg-header {')).not.toContain('sticky');
  });

  it('the busy wrapper fills the sheet like the frame it holds; the sheet clips overflow and anchors the chip', () => {
    expect(block(arrangeCss, '.arrange-preview-doc {')).toContain('flex: 1 1 auto');
    expect(block(arrangeCss, '.arrange-preview-sheet {')).toContain('overflow: hidden');
    expect(block(arrangeCss, '.arrange-preview-sheet {')).toContain('position: relative');
    expect(block(arrangeCss, '.arrange-preview-status {')).toContain('position: absolute');
    expect(block(appCss, ':focus-visible {')).toContain('outline-offset: var(--sg-focus-offset)');
  });

  it('reduced motion: animations, transitions, spinner and motion tokens are all zeroed', () => {
    const rm = appCss.slice(appCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(rm).toContain('--sg-motion-fast: 0ms');
    expect(rm).toContain('--sg-motion: 0ms');
    expect(rm).toContain('animation: none !important');
    expect(rm).toContain('transition: none !important');
    expect(rm).toContain('.spinner-border');
    // The only animation on the preview pane is the sheet entrance, which uses the token.
    expect(block(appCss, '.sg-sheet-enter {')).toContain('var(--sg-motion)');
    expect(arrangeCss).not.toMatch(/animation|transition/);
  });

  it('arrange.css has no hard-coded colors (every color is a token)', () => {
    expect(arrangeCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});

describe('the sandbox claim', () => {
  const hostile = [
    '<p onmouseover="alert(1)">x</p>',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">j</a>',
    '<a href="&#106;avascript:alert(1)">e</a>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<svg><script>alert(1)</script></svg>',
    '<form action="javascript:alert(1)"><button>b</button></form>',
    '<object data="data:text/html,<script>alert(1)</script>"></object>',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<style>body{background:url(https://evil/x)}</style>',
    '<div style="background:url(https://evil/x)">s</div>',
  ].join('');

  function page(id: string, title: string, html: string): ProcessedPage {
    return {
      resourceId: id,
      sectionId: id,
      title,
      kind: 'page',
      original: html,
      neutral: html,
      notices: [],
      report: [],
    } as unknown as ProcessedPage;
  }

  it('an assembled document built from hostile sections and cover fields has no script, handler, or script URL', () => {
    const doc = assembleDocument({
      options: { ...OPTIONS, presentation: 'original' },
      cover: {
        ...COVER,
        courseTitle: '<script>alert(1)</script>"><img src=x onerror=alert(1)>',
        instructor: '</p><script>alert(2)</script>',
        email: 'javascript:alert(3)',
        officeHours: '<a href="javascript:alert(4)">o</a>',
        institution: '"><svg onload=alert(5)>',
        logoDataUri: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      },
      sections: [page('r1', '<script>t</script>', hostile), page('r2', 'Two', '<p>fine</p>')],
    } as never);
    const html = doc.html;
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    expect(parsed.querySelectorAll('script, iframe, object, embed, svg, meta[http-equiv], form, button')).toHaveLength(0);
    // Only the assembler's own <style> (theme css) remains; hostile <style> is gone.
    expect(parsed.querySelectorAll('style')).toHaveLength(1);
    expect(parsed.querySelector('style')!.textContent).not.toContain('evil');
    for (const el of Array.from(parsed.querySelectorAll('*'))) {
      for (const a of Array.from(el.attributes)) {
        expect(a.name.toLowerCase().startsWith('on'), `${el.tagName} ${a.name}`).toBe(false);
        expect(a.value.replace(/\s/g, '').toLowerCase(), `${el.tagName} ${a.name}`).not.toMatch(/^javascript:/);
        expect(a.value, `${el.tagName} ${a.name}`).not.toContain('evil');
      }
    }
    // No remote loads from the frame: the logo was rejected (not an image data URI).
    expect(parsed.querySelector('img.sg-logo')).toBeNull();
    // Deterministic.
    const build = (): string =>
      assembleDocument({
        options: { ...OPTIONS, presentation: 'original' },
        cover: COVER,
        sections: [page('r1', 'One', hostile)],
      } as never).html;
    expect(build()).toBe(build());
  });
});
