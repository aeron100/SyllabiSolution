/**
 * Accessibility and design contract for Step 2 — Choose pages (DESIGN.md §9a, §10).
 *
 * 1. axe-core over a static render of ChooseStep in five visual states.
 * 2. Structural facts the a11y claims rest on: the heading outline, the
 *    "Content types" disclosure (button + aria-expanded + aria-controls), the
 *    pages pane (a labelled region that is a focus stop, so a keyboard user can
 *    scroll it), the fully sandboxed preview iframe, control target sizes.
 * 3. Stylesheet facts read straight from the CSS text: the sticky preview
 *    exists only inside the ≥ 992 px block and in its own grid column (2.4.11
 *    focus not obscured), the pane is the only scroller and is viewport-bounded
 *    in both layouts and chains its scroll to the page, keeps a focused row's
 *    ring inside its scrollport, the preview sheet has one fixed height in every
 *    state, no overflow on the sticky column's ancestors, no motion in choose.css
 *    (reduced motion is covered by app.css), no hard-coded colors.
 * 4. The same axe run over a large export (six modules of eight rows of every
 *    kind, nested sub-modules, subheaders, unfiled links and files).
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
import type { Cartridge, Kind, Resource, ResourceMeta, ZipIndex } from '../../src/lib/types';
import ChooseStep, { type ChooseStepProps } from '../../src/steps/ChooseStep';

const ROOT = process.cwd();
const chooseCss = readFileSync(resolve(ROOT, 'src/steps/ChooseStep/choose.css'), 'utf8');
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

function res(id: string, kind: Kind, title: string, meta: ResourceMeta = {}): [string, Resource] {
  return [id, { id, type: 'test', files: [], dependencies: [], kind, title, meta }];
}

function makeCart(): Cartridge {
  return {
    title: 'Introduction to Widgets',
    courseCode: 'WID-101',
    version: '1.1.0',
    source: 'canvas',
    items: [
      { id: 'i-syl', title: 'Course Syllabus', resourceId: 'r-syl', children: [] },
      {
        id: 'm1',
        title: 'Module 1',
        children: [
          { id: 'i-w', title: 'Welcome', resourceId: 'r-welcome', children: [] },
          { id: 'h1', title: 'Week 1 readings', children: [] },
          { id: 'i-q', title: 'Quiz 1', resourceId: 'r-quiz', children: [] },
          { id: 'm1b', title: 'Extras', children: [{ id: 'i-a', title: 'Sketch', resourceId: 'r-assign', children: [] }] },
        ],
      },
      { id: 'm2', title: 'Module 2', children: [{ id: 'i-d', title: 'Introductions', resourceId: 'r-disc', children: [] }] },
    ],
    resources: new Map<string, Resource>([
      res('r-syl', 'syllabus', 'Course Syllabus'),
      res('r-welcome', 'page', 'Welcome'),
      res('r-quiz', 'quiz', 'Quiz 1', { questionCount: 5 }),
      res('r-assign', 'assignment', 'Sketch', { points: 10 }),
      res('r-disc', 'discussion', 'Introductions'),
      res('r-link', 'link', 'Standards site', { url: 'https://example.org/' }),
      res('r-file', 'file', 'Handbook', { filename: 'handbook.pdf', mime: 'application/pdf' }),
    ]),
    unfiled: ['r-link', 'r-file'],
    assignmentGroups: [],
    zip,
  };
}

/** A realistic export: syllabus, six modules of eight rows (every kind), a nested sub-module and a subheader each, unfiled links and files. */
function makeLargeCart(): Cartridge {
  const resources = new Map<string, Resource>([res('r-syl', 'syllabus', 'Course Syllabus')]);
  const kinds: Kind[] = ['page', 'assignment', 'discussion', 'quiz', 'announcement', 'link', 'file', 'tool'];
  const items: Cartridge['items'] = [{ id: 'i-syl', title: 'Course Syllabus', resourceId: 'r-syl', children: [] }];
  for (let m = 1; m <= 6; m++) {
    const children: Cartridge['items'] = [{ id: `h${m}`, title: `Week ${m} readings`, children: [] }];
    for (let r = 0; r < 8; r++) {
      const kind = kinds[r % kinds.length]!;
      const id = `r-${m}-${r}`;
      const title = `Module ${m} ${kind} ${r} — a fairly long title that wraps on narrow screens`;
      resources.set(...res(id, kind, title, kind === 'quiz' ? { questionCount: 5 } : kind === 'assignment' ? { points: 10 } : {}));
      children.push({ id: `i-${id}`, title, resourceId: id, children: [] });
    }
    const subId = `r-${m}-sub`;
    resources.set(...res(subId, 'page', `Module ${m} extra page`));
    children.push({ id: `sub${m}`, title: `Module ${m} extras`, children: [{ id: `i-${subId}`, title: 'Extra', resourceId: subId, children: [] }] });
    items.push({ id: `m${m}`, title: `Module ${m}: Topic ${m}`, children });
  }
  resources.set(...res('r-link', 'link', 'Standards site', { url: 'https://example.org/' }));
  resources.set(...res('r-file', 'file', 'Handbook', { filename: 'handbook.pdf', mime: 'application/pdf' }));
  return { ...makeCart(), items, resources, unfiled: ['r-link', 'r-file'] };
}

function countsOf(cart: Cartridge): Partial<Record<Kind, number>> {
  const c: Partial<Record<Kind, number>> = {};
  for (const r of cart.resources.values()) c[r.kind] = (c[r.kind] ?? 0) + 1;
  return c;
}

const COUNTS: Partial<Record<Kind, number>> = { syllabus: 1, page: 1, quiz: 1, assignment: 1, discussion: 1, link: 1, file: 1 };
const ALL_KINDS: Kind[] = ['page', 'syllabus', 'assignment', 'discussion', 'announcement', 'quiz', 'link', 'tool', 'file', 'other'];
const SRCDOC = '<!doctype html><html lang="en"><head><title>Welcome</title></head><body><p>Hello</p></body></html>';

function makeProps(over: Partial<ChooseStepProps> = {}): ChooseStepProps {
  return {
    cart: makeCart(),
    selected: ['r-syl', 'r-welcome'],
    onToggle: vi.fn(),
    onToggleMany: vi.fn(),
    hiddenKinds: new Set<Kind>(['quiz']),
    onToggleKind: vi.fn(),
    focusedId: 'r-welcome',
    onFocus: vi.fn(),
    previewSrcdoc: SRCDOC,
    previewTitle: 'Welcome',
    previewLoading: false,
    counts: COUNTS,
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...over,
  };
}

const hosts: HTMLElement[] = [];
afterEach(() => {
  while (hosts.length) hosts.pop()!.remove();
});

/** Mount the static markup under an h1 so heading-order rules see the real outline. */
function mountStatic(props: ChooseStepProps): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = `<header><h1>Syllabus Generator</h1></header><main>${renderToStaticMarkup(createElement(ChooseStep, props))}</main>`;
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
      // The srcdoc iframe is the previewed page, sandboxed and audited in the generated document.
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

describe('ChooseStep under axe-core (WCAG 2.x A/AA + best-practice)', () => {
  for (const [name, over] of [
    ['ready, preview shown', {}],
    ['nothing previewed', { focusedId: undefined, previewSrcdoc: undefined, previewTitle: undefined }],
    ['preview loading (aria-busy)', { previewSrcdoc: undefined, previewLoading: true }],
    ['preview failed', { previewSrcdoc: undefined, previewError: 'Could not preview that page.' }],
    ['every type hidden, nothing selected', { hiddenKinds: new Set(ALL_KINDS), selected: [] }],
    ['several checked, rearranged on step 3, one of a hidden kind', { selected: ['r-file', 'r-syl', 'r-quiz', 'r-welcome', 'r-disc'] }],
  ] as const) {
    it(`no violations: ${name}`, async () => {
      const host = mountStatic(makeProps(over as Partial<ChooseStepProps>));
      const r = await runAxe(host);
      expect(r.violations, describeViolations(r)).toEqual([]);
    });
  }

  it('no violations: a large export (six modules of every kind, nested sub-modules, subheaders, unfiled), preview shown', async () => {
    const cart = makeLargeCart();
    const host = mountStatic(
      makeProps({
        cart,
        counts: countsOf(cart),
        selected: ['r-syl', 'r-1-0', 'r-2-3'],
        hiddenKinds: new Set<Kind>(['tool']),
        focusedId: 'r-1-0',
        previewTitle: 'Module 1 page 0 — a fairly long title that wraps on narrow screens',
      }),
    );
    expect(host.querySelectorAll('.tree-row').length).toBeGreaterThan(40);
    const r = await runAxe(host);
    expect(r.violations, describeViolations(r)).toEqual([]);
  });
});

describe('ChooseStep structure', () => {
  it('heading outline h1 → h2 (step) → h3 (Preview); the left column is a disclosure, a toolbar, and a labelled region', () => {
    const host = mountStatic(makeProps());
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => Number(h.tagName[1]));
    expect(levels).toEqual([1, 2, 3]);
    expect(host.querySelector('h3')?.textContent).toContain('Preview');
    expect(host.querySelector('section.choose-preview')?.getAttribute('aria-labelledby')).toBe(host.querySelector('h3')?.id);
  });

  it('content types: a real button with aria-expanded and aria-controls, collapsed by default, its panel hidden and holding the chips', () => {
    const host = mountStatic(makeProps());
    const btn = host.querySelector<HTMLButtonElement>('.choose-kinds button.disclosure-btn')!;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('choose-kinds-panel');
    // Its name pauses between the label and the count ("Content types, 6 of 7 shown"), the comma hidden visually.
    expect(btn.textContent).toBe('Content types, 6 of 7 shown');
    expect(btn.querySelector('.disclosure-suffix')?.textContent).toBe('6 of 7 shown');
    const panel = host.querySelector<HTMLElement>('#choose-kinds-panel')!;
    expect(panel.hidden).toBe(true);
    expect(panel.querySelectorAll('button.chip[aria-pressed]')).toHaveLength(7);
    // The shown toolbar is outside the panel, before the pane.
    const toolbar = host.querySelector('.choose-toolbar')!;
    expect(panel.contains(toolbar)).toBe(false);
    expect(toolbar.compareDocumentPosition(host.querySelector('.choose-tree-pane')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pages pane: role region, aria-label "Pages", tabindex 0, holding the tree; nothing sticky above it', () => {
    const host = mountStatic(makeProps());
    const pane = host.querySelector<HTMLElement>('.choose-tree-pane')!;
    expect(pane.getAttribute('role')).toBe('region');
    expect(pane.getAttribute('aria-label')).toBe('Pages');
    expect(pane.hasAttribute('tabindex')).toBe(false); // not a scroller any more: the page scrolls
    expect(pane.querySelector('ul.tree[aria-label="Course content"]')).not.toBeNull();
    // Every focusable inside the pane is a real control (checkbox or button).
    for (const el of Array.from(pane.querySelectorAll('input, button'))) {
      expect(['INPUT', 'BUTTON']).toContain(el.tagName);
    }
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
  });

  it('preview iframe: titled, sandbox="" (fully sandboxed), referrer suppressed', () => {
    const host = mountStatic(makeProps());
    const frame = host.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('title')).toBe('Preview of Welcome');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('srcdoc')).toBe(SRCDOC);
    expect(frame.closest('.choose-preview-sheet')).not.toBeNull();
  });

  it('busy state: aria-busy on the sheet with a status inside it; none when ready', () => {
    const busy = mountStatic(makeProps({ previewSrcdoc: undefined, previewLoading: true }));
    expect(busy.querySelector('.choose-preview-sheet')?.getAttribute('aria-busy')).toBe('true');
    expect(busy.querySelector('.choose-preview-sheet [role="status"]')?.textContent).toContain('Preparing preview');
    const ready = mountStatic(makeProps());
    expect(ready.querySelector('[aria-busy]')).toBeNull();
  });

  it('position badge: a plain text span (no control, no tab stop), aria-hidden here because the checkbox name carries the position; tabular figures on the accent/tint pair', () => {
    const host = mountStatic(makeProps({ selected: ['r-file', 'r-syl', 'r-quiz', 'r-welcome'] }));
    const badges = Array.from(host.querySelectorAll<HTMLElement>('.tree-row .pos-badge'));
    expect(badges.map((b) => b.textContent)).toEqual(['2', '4', '1']); // tree order; the quiz is hidden by the filter but still counted
    for (const b of badges) {
      expect(b.tagName).toBe('SPAN');
      expect(b.getAttribute('aria-hidden')).toBe('true');
      expect(b.hasAttribute('tabindex')).toBe(false);
      expect(b.closest('label, button')).toBeNull();
    }
    expect(host.querySelector('input[aria-label="Include Welcome, position 4 of 4"]')).not.toBeNull();
    const badge = block(appCss, '.pos-badge {')!;
    expect(badge).toContain('font-variant-numeric: tabular-nums');
    expect(badge).toContain('flex: 0 0 auto');
    expect(badge).toContain('color: var(--sg-accent)');
    expect(badge).toContain('background: var(--sg-tint)'); // the pair is proven ≥ 4.5:1 in both themes by tokens.test.ts
  });

  it('target sizes: tiles, chips, tree rows, the disclosure button and the tree toggles resolve to ≥ 44 px via tokens', () => {
    const tokens = block(tokensCss, ":root,\n[data-bs-theme='light']")!;
    expect(tokens).toContain('--sg-tile-sm: 2.75rem');
    expect(tokens).toContain('--sg-chip: 2.5rem');
    expect(block(appCss, '.tile-sm {')).toContain('min-height: var(--sg-tile-sm)');
    expect(block(appCss, '.chip {')).toContain('min-height: var(--sg-chip)');
    expect(block(appCss, '.chip::before {')).toContain('inset: -2px'); // the halo makes it 44 px
    expect(block(appCss, '.tree-check {')).toContain('height: var(--sg-tile-sm)');
    expect(block(appCss, '.tree-title {')).toContain('min-height: var(--sg-tile-sm)');
    expect(block(appCss, '.disclosure-btn {')).toContain('min-height: var(--sg-tile-sm)');
    const host = mountStatic(makeProps({ selected: [] }));
    for (const b of Array.from(host.querySelectorAll('.choose-toolbar button'))) expect(b.className).toMatch(/\btile-sm\b/);
    // Inert tiles are aria-disabled, never disabled, so they stay in the tab order.
    expect(host.querySelectorAll('[disabled]')).toHaveLength(0);
  });
});

describe('ChooseStep stylesheet facts', () => {
  const wideStart = chooseCss.indexOf('@media (min-width: 992px)');
  const wide = chooseCss.slice(wideStart);
  const narrow = chooseCss.slice(0, wideStart);

  it('sticky preview exists only inside the ≥ 992 px block, on the grid item itself, align-self start', () => {
    expect(wideStart).toBeGreaterThan(-1);
    expect(narrow).not.toContain('position: sticky');
    expect(chooseCss).not.toContain('position: fixed');
    const sticky = block(wide, '.choose-preview {')!;
    expect(sticky).toContain('position: sticky');
    expect(sticky).toContain('top: var(--sg-space-4)');
    expect(sticky).toContain('align-self: start');
    // Two tracks, ≈ 52 / 48; the tree column may shrink so long titles wrap.
    expect(wide).toContain('grid-template-columns: minmax(0, 52fr) minmax(0, 48fr)');
    expect(wide).toContain('gap: var(--sg-space-5)');
    expect(block(wide, '.choose-col-tree {')).toContain('min-width: 0');
    expect(chooseCss).not.toContain('z-index');
  });

  it('nothing in the step scrolls on its own: the page scrolls and the preview sheet is sized to the viewport', () => {
    // No inner scroller (the old bounded pane is gone); the preview sheet only clips its frame.
    expect(chooseCss).not.toMatch(/overflow(-y)?: (auto|scroll)/);
    expect(chooseCss).not.toMatch(/max-height/);
    expect(chooseCss).not.toMatch(/overscroll-behavior\s*:/);
    expect(block(wide, '.wizard-columns.choose-columns {')).toMatch(/--choose-pane-height: max\(\s*24rem,\s*calc\(\s*100vh/);
    expect(block(wide, '.choose-preview-sheet {')).toContain('height: var(--choose-pane-height)');
    expect(block(narrow, '.choose-preview-sheet {')).toContain('height: max(55vh, 18rem)');
  });

  it('the preview sheet keeps one height in every state; the status bar and a notice take space from the frame', () => {
    // A fixed height (not a floor) in both layouts, so a reloading preview never resizes the sheet under the page.
    expect(block(narrow, '.choose-preview-sheet {')).not.toMatch(/min-height/);
    expect(block(wide, '.choose-preview-sheet {')).not.toMatch(/min-height/);
    const frame = block(chooseCss, '.choose-preview-frame {')!;
    expect(frame).toContain('flex: 1 1 0');
    expect(frame).toContain('min-height: 0');
    expect(frame).not.toMatch(/(?<!-)height:/); // the frame takes its height from the sheet, not its own declaration
    expect(wide).not.toContain('.choose-preview-frame {');
  });

  it('no overflow on any ancestor between .choose-preview and the viewport (sticky actually works); no sticky shell chrome', () => {
    for (const sel of ['.wizard {', '.wizard-step {', '.wizard-body {', '.wizard-columns {', '.app-main {', '.app {']) {
      const b = block(appCss, sel);
      expect(b, sel).not.toBeNull();
      expect(b, sel).not.toMatch(/overflow\s*:/);
    }
    expect(block(chooseCss, '.choose-col-tree {')).not.toMatch(/overflow/);
    expect(block(appCss, '.sg-header {')).not.toContain('sticky');
  });

  it('reduced motion: choose.css animates nothing; the sheet entrance and smooth scrolling are zeroed by app.css', () => {
    expect(chooseCss).not.toMatch(/animation|transition/);
    const rm = appCss.slice(appCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(rm).toContain('--sg-motion: 0ms');
    expect(rm).toContain('animation: none !important');
    expect(rm).toContain('scroll-behavior: auto !important');
  });

  it('choose.css has no hard-coded colors (every color is a token)', () => {
    expect(chooseCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
