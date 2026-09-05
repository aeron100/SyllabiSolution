/**
 * Step 2 — Choose pages: renders under jsdom (static markup for structure
 * and ARIA; a client render for the tri-state checkbox and click wiring).
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ChooseStep, { type ChooseStepProps } from '../../src/steps/ChooseStep';
import type { Cartridge, Kind, Resource, ResourceMeta, ZipIndex } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// A small hand-built cartridge: a top-level syllabus, one module with a page,
// a subheader, a quiz and a nested module, plus two unfiled resources.
// ---------------------------------------------------------------------------

const zip: ZipIndex = {
  names: () => [],
  has: () => false,
  resolve: () => null,
  size: () => undefined,
  bytes: async () => new Uint8Array(),
  text: async () => '',
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
          {
            id: 'm1b',
            title: 'Extras',
            children: [{ id: 'i-a', title: 'Sketch', resourceId: 'r-assign', children: [] }],
          },
        ],
      },
    ],
    resources: new Map<string, Resource>([
      res('r-syl', 'syllabus', 'Course Syllabus'),
      res('r-welcome', 'page', 'Welcome'),
      res('r-quiz', 'quiz', 'Quiz 1', { questionCount: 5 }),
      res('r-assign', 'assignment', 'Sketch', { points: 10 }),
      res('r-link', 'link', 'Standards site', { url: 'https://example.org/' }),
      res('r-file', 'file', 'Handbook', { filename: 'handbook.pdf', mime: 'application/pdf' }),
    ]),
    unfiled: ['r-link', 'r-file'],
    assignmentGroups: [],
    zip,
  };
}

const COUNTS: Partial<Record<Kind, number>> = { syllabus: 1, page: 1, quiz: 1, assignment: 1, link: 1, file: 1 };

function baseProps(over: Partial<ChooseStepProps> = {}): ChooseStepProps {
  return {
    cart: makeCart(),
    selected: ['r-syl', 'r-welcome'],
    onToggle: vi.fn(),
    onToggleMany: vi.fn(),
    hiddenKinds: new Set<Kind>(['quiz']),
    onToggleKind: vi.fn(),
    focusedId: 'r-welcome',
    onFocus: vi.fn(),
    previewSrcdoc: '<!doctype html><html lang="en"><head><title>Welcome</title></head><body><p>Hello</p></body></html>',
    previewTitle: 'Welcome',
    previewLoading: false,
    counts: COUNTS,
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...over,
  };
}

function render(over: Partial<ChooseStepProps> = {}): string {
  return renderToStaticMarkup(<ChooseStep {...baseProps(over)} />);
}

// ---------------------------------------------------------------------------
// Static markup
// ---------------------------------------------------------------------------

describe('ChooseStep: frame and navigation', () => {
  it('renders the step heading, intro, and nav tiles', () => {
    const html = render();
    expect(html).toContain('id="wizard-step-2-heading"');
    expect(html).toContain('>Choose pages<');
    expect(html).toMatch(/aria-labelledby="wizard-step-2-heading"/);
    expect(html).toContain('Back');
    expect(html).toContain('Next');
    expect(html).toContain('2 selected');
  });

  it('keeps Next inert with a hint until something is checked', () => {
    const html = render({ selected: [] });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Choose at least one page to continue.');
    // Both nav bars carry the hint, each with its own id.
    expect(html).toContain('aria-describedby="wizard-step-2-next-hint-top"');
    expect(html).toContain('aria-describedby="wizard-step-2-next-hint-bottom"');
    expect(html).toContain('0 selected');
    // With a selection the hint disappears and Next is live.
    const live = render();
    expect(live).not.toContain('Choose at least one page to continue.');
    expect(live).not.toMatch(/class="tile tile-primary[^"]*"[^>]*aria-disabled="true"/);
  });

  it('never emits script in the app markup', () => {
    expect(render()).not.toMatch(/<script/i);
  });
});

/** The static markup parsed, for structural checks that regexes make brittle. */
function dom(over: Partial<ChooseStepProps> = {}): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = render(over);
  return host;
}

describe('ChooseStep: content types disclosure', () => {
  it('is a button with aria-expanded and aria-controls, collapsed by default, named "Content types" with an "of N shown" suffix', () => {
    const host = dom();
    const btn = host.querySelector<HTMLButtonElement>('button[aria-controls="choose-kinds-panel"]')!;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.querySelector('.disclosure-label')?.textContent).toBe('Content types');
    // Six kinds present in the export, the quiz chip off.
    expect(btn.querySelector('.disclosure-suffix')?.textContent).toBe('5 of 6 shown');
    const panel = host.querySelector<HTMLElement>('#choose-kinds-panel')!;
    expect(panel.hidden).toBe(true);
    // The old column heading is gone.
    expect(render()).not.toContain('Course content</h3>');
  });

  it('counts every chip as shown when nothing is hidden', () => {
    const host = dom({ hiddenKinds: new Set() });
    expect(host.querySelector('.disclosure-suffix')?.textContent).toBe('6 of 6 shown');
  });

  it('holds the chips inside the panel and the shown toolbar outside it, directly above the pages pane', () => {
    const host = dom();
    const panel = host.querySelector('#choose-kinds-panel')!;
    expect(panel.querySelectorAll('.chip')).toHaveLength(6);
    expect(panel.querySelector('[aria-label="Show kinds"]')).not.toBeNull();
    const toolbar = host.querySelector('[role="group"][aria-label="Shown pages"]')!;
    expect(panel.contains(toolbar)).toBe(false);
    expect(toolbar.classList.contains('choose-toolbar')).toBe(true);
    expect(toolbar.querySelector('.choose-toolbar-count')?.textContent).toBe('2 selected');
    // Order in the left column: disclosure, toolbar, pane.
    const col = host.querySelector('.choose-col-tree')!;
    expect(Array.from(col.children).map((c) => c.className.split(' ')[0])).toEqual(['disclosure', 'choose-toolbar', 'sg-sheet']);
  });
});

describe('ChooseStep: filter chips', () => {
  it('shows one aria-pressed chip per kind present, with a count', () => {
    const html = render();
    expect(html).toContain('aria-label="Show kinds"');
    expect(html).toMatch(/class="chip kind-page" aria-pressed="true"/);
    expect(html).toMatch(/class="chip kind-quiz" aria-pressed="false"/);
    expect(html).toContain('<span class="chip-label">Pages</span>');
    expect(html).toContain('<span class="chip-count tnum">1</span>');
    expect(html).not.toContain('Discussions');
    expect(html).not.toContain('Announcements');
  });

  it('offers Select all shown and Clear shown as 44 px tiles', () => {
    const html = render();
    expect(html).toContain('aria-label="Shown pages"');
    expect(html).toMatch(/class="tile tile-secondary tile-sm"[^>]*>.*Select all shown/);
    expect(html).toMatch(/class="tile tile-secondary tile-sm"[^>]*>.*Clear shown/);
  });
});

describe('ChooseStep: pages pane', () => {
  it('is a labelled region on a sheet that wraps the tree (the page scrolls; the pane is not a tab stop)', () => {
    const host = dom();
    const pane = host.querySelector<HTMLElement>('.choose-tree-pane')!;
    expect(pane.getAttribute('role')).toBe('region');
    expect(pane.getAttribute('aria-label')).toBe('Pages');
    expect(pane?.hasAttribute('tabindex')).toBe(false);
    expect(pane.classList.contains('sg-sheet')).toBe(true);
    expect(pane.querySelector('ul.tree')).not.toBeNull();
    // Only the pane is the sheet; the tree inside is not a second one.
    expect(pane.querySelector('.choose-tree')?.classList.contains('sg-sheet')).toBe(false);
  });

  it('keeps the region even when the filter hides every row', () => {
    const all: Kind[] = ['page', 'syllabus', 'assignment', 'discussion', 'announcement', 'quiz', 'link', 'tool', 'file', 'other'];
    const host = dom({ hiddenKinds: new Set(all) });
    expect(host.querySelector('.choose-tree-pane[role="region"] .choose-tree-empty')).not.toBeNull();
  });
});

describe('ChooseStep: content tree', () => {
  it('renders modules as disclosures with tri-state checkboxes and counts', () => {
    const html = render();
    expect(html).toContain('aria-label="Course content"');
    expect(html).toContain('aria-label="Collapse Module 1"');
    expect(html).toMatch(/aria-expanded="true" aria-controls="choose-grp-m1"/);
    // The first module starts open; Unfiled starts collapsed.
    expect(html).toMatch(/aria-expanded="false" aria-controls="choose-grp-unfiled"/);
    expect(html).toContain('aria-label="Include all in Module 1"');
    expect(html).toContain('id="choose-grp-m1"');
    expect(html).toMatch(/<ul[^>]*class="tree-children"[^>]*aria-labelledby="choose-gt-m1"/);
    expect(html).not.toMatch(/<ul[^>]*role="group"/); // a ul keeps its list role so its rows stay list items
    // Module 1 shows 2 rows (quiz hidden): Welcome checked, Sketch not.
    expect(html).toContain('1/2<span class="visually-hidden"> selected</span>');
    // Nested module.
    expect(html).toContain('aria-label="Include all in Extras"');
  });

  it('renders rows with a labelled checkbox, a kind pill, and a preview button', () => {
    const html = render();
    expect(html).toMatch(/<input type="checkbox"[^>]*aria-label="Include Welcome, position 2 of 2" checked=""\/>/);
    expect(html).toMatch(/<input type="checkbox"[^>]*aria-label="Include Sketch"\/>/);
    expect(html).toContain('class="kind-tag kind-page"');
    expect(html).toContain('<span class="kind-tag-label">Page</span>');
    expect(html).toContain('<span class="kind-tag-label">Assignment</span>');
    // Focused row: aria-pressed on the title button, is-focused on the row.
    expect(html).toMatch(/class="tree-row is-focused">.*aria-pressed="true"[^>]*>.*Welcome/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*Sketch/);
  });

  // DESIGN.md §10: the order of selection is the document order; a checked row shows its position.
  describe('position badges', () => {
    const BADGE = /<span class="pos-badge tnum" aria-hidden="true">(\d+)<\/span>/g;

    it('shows a badge between the checkbox and the kind pill on every checked row, numbered by selection order', () => {
      const host = dom({ selected: ['r-syl', 'r-welcome', 'r-file'] });
      const rows = Array.from(host.querySelectorAll<HTMLElement>('.tree-row'));
      const checked = rows.filter((r) => r.querySelector<HTMLInputElement>('input[type="checkbox"]')?.hasAttribute('checked'));
      expect(checked).toHaveLength(3);
      for (const row of checked) {
        const kids = Array.from(row.children).map((c) => c.className.split(' ')[0]);
        expect(kids.slice(0, 3)).toEqual(['tree-check', 'pos-badge', 'kind-tag']);
        const badge = row.querySelector('.pos-badge')!;
        expect(badge.classList.contains('tnum')).toBe(true);
        expect(badge.getAttribute('aria-hidden')).toBe('true');
        // Never a control or a tab stop: a plain span outside any label or button.
        expect(badge.tagName).toBe('SPAN');
        expect(badge.hasAttribute('tabindex')).toBe(false);
        expect(badge.closest('label, button')).toBeNull();
      }
      const byTitle = (t: string): HTMLElement => checked.find((r) => r.querySelector('.tree-title')?.textContent?.includes(t))!;
      expect(byTitle('Course Syllabus').querySelector('.pos-badge')?.textContent).toBe('1');
      expect(byTitle('Welcome').querySelector('.pos-badge')?.textContent).toBe('2');
      expect(byTitle('Handbook').querySelector('.pos-badge')?.textContent).toBe('3');
      expect(render({ selected: ['r-syl', 'r-welcome', 'r-file'] })).toContain('<span class="pos-badge tnum" aria-hidden="true">3</span>');
    });

    it('puts the position in the checkbox name ("position n of m"); unchecked rows keep the plain name and no badge', () => {
      const html = render({ selected: ['r-syl', 'r-welcome', 'r-file'] });
      expect(html).toContain('aria-label="Include Course Syllabus, position 1 of 3"');
      expect(html).toContain('aria-label="Include Welcome, position 2 of 3"');
      expect(html).toContain('aria-label="Include Handbook, position 3 of 3"');
      expect(html).toContain('aria-label="Include Sketch"');
      expect(html).toContain('aria-label="Include Standards site"');
      expect(html).not.toMatch(/aria-label="Include Sketch, position/);
      const host = dom({ selected: ['r-syl', 'r-welcome', 'r-file'] });
      const unchecked = Array.from(host.querySelectorAll<HTMLElement>('.tree-row')).filter(
        (r) => !r.querySelector<HTMLInputElement>('input[type="checkbox"]')?.hasAttribute('checked'),
      );
      expect(unchecked.length).toBeGreaterThan(0);
      for (const row of unchecked) expect(row.querySelector('.pos-badge')).toBeNull();
      expect(Array.from(html.matchAll(BADGE)).map((m) => m[1])).toEqual(['1', '2', '3']);
    });

    it('follows the ordered list, not the tree: a step-3 rearrangement shows on the way back', () => {
      // Welcome was moved above the syllabus on step 3.
      const html = render({ selected: ['r-welcome', 'r-syl'] });
      expect(html).toContain('aria-label="Include Welcome, position 1 of 2"');
      expect(html).toContain('aria-label="Include Course Syllabus, position 2 of 2"');
      const syl = html.indexOf('Include Course Syllabus');
      const welcome = html.indexOf('Include Welcome');
      expect(syl).toBeLessThan(welcome); // the tree keeps its own order …
      expect(html.slice(syl).match(BADGE)?.[0]).toContain('>2<'); // … only the numbers move
    });

    it('counts a hidden kind in "of m" but shows no badge for it', () => {
      const html = render({ selected: ['r-quiz', 'r-welcome'] }); // quizzes are hidden by the filter
      expect(html).not.toContain('Include Quiz 1');
      expect(html).toContain('aria-label="Include Welcome, position 2 of 2"');
      expect(Array.from(html.matchAll(BADGE)).map((m) => m[1])).toEqual(['2']);
    });

    it('module heads keep their "n/m" count and get no badge', () => {
      const host = dom({ selected: ['r-syl', 'r-welcome', 'r-assign'] });
      const head = host.querySelector<HTMLElement>('.tree-group-head')!;
      expect(head.querySelector('.pos-badge')).toBeNull();
      expect(host.querySelector('#choose-grp-m1')?.previousElementSibling?.querySelector('.tree-count')?.textContent).toContain('2/2');
    });
  });

  it('hides filtered kinds but keeps their selection', () => {
    const html = render({ selected: ['r-quiz'] });
    expect(html).not.toContain('Include Quiz 1');
    expect(html).toContain('1 selected'); // the hidden quiz still counts
  });

  it('shows header-only items as subheaders and hints for non-obvious kinds', () => {
    const html = render();
    expect(html).toContain('<li class="tree-subheader">Week 1 readings</li>');
    expect(html).toContain('Title and filename only');
    expect(html).toContain('Title linked to the address');
    expect(html).toMatch(/aria-describedby="choose-hint-unfiled_1"/);
  });

  it('starts every module after the first collapsed, and Unfiled collapsed', () => {
    const cart = makeCart();
    cart.items.push({
      id: 'm2',
      title: 'Module 2',
      children: [{ id: 'i-f', title: 'Handbook', resourceId: 'r-file', children: [] }],
    });
    const html = render(baseProps({ cart }));
    expect(html).toMatch(/aria-expanded="true" aria-controls="choose-grp-m1"/);
    expect(html).toMatch(/aria-expanded="false" aria-controls="choose-grp-m2"/);
    expect(html).toMatch(/aria-expanded="false" aria-controls="choose-grp-unfiled"/);
  });

  it('puts Unfiled last', () => {
    const html = render();
    const m1 = html.indexOf('Include all in Module 1');
    const unfiled = html.indexOf('Include all in Unfiled');
    expect(m1).toBeGreaterThan(-1);
    expect(unfiled).toBeGreaterThan(m1);
    expect(html).toContain('Include Handbook');
    expect(html).toContain('Include Standards site');
  });

  it('says what to do when the filter hides everything', () => {
    const all: Kind[] = ['page', 'syllabus', 'assignment', 'discussion', 'announcement', 'quiz', 'link', 'tool', 'file', 'other'];
    const html = render({ hiddenKinds: new Set(all) });
    expect(html).toContain('No pages match the current filter. Open Content types above to turn a type back on.');
    expect(html).not.toContain('aria-label="Course content"');
  });
});

describe('ChooseStep: preview sheet', () => {
  it('renders the caption, the hint, and a fully sandboxed iframe', () => {
    const html = render();
    expect(html).toMatch(/<h3 class="wizard-col-title choose-preview-caption" id="choose-preview-title">Preview.*Welcome<\/span><\/h3>/);
    expect(html).toMatch(/<section class="wizard-col choose-preview" aria-labelledby="choose-preview-title">/);
    expect(html).toContain('<p class="sg-hint choose-preview-hint">Click a page on the left to preview its content.</p>');
    // React's static renderer keeps srcDoc/referrerPolicy camel-cased; HTML attributes are case-insensitive.
    expect(html).toMatch(/<iframe[^>]*sandbox=""[^>]*srcdoc="[^"]*"[^>]*title="Preview of Welcome"/i);
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
    expect(html).toContain('&lt;p&gt;Hello&lt;/p&gt;'); // srcdoc is escaped, never injected
    expect(html).toContain('class="sg-sheet choose-preview-sheet sg-sheet-enter"');
  });

  it('guides the user when nothing is previewed', () => {
    const html = render({ focusedId: undefined, previewSrcdoc: undefined, previewTitle: undefined });
    expect(html).toContain('Nothing previewed yet.');
    expect(html).toContain('Click a page on the left to preview its content.');
    expect(html).not.toContain('<iframe');
  });

  it('keeps one DOM order for both layouts: content types, toolbar, pages pane, preview', () => {
    const host = dom();
    const order = ['#choose-kinds-panel', '.choose-toolbar', '.choose-tree-pane', '.choose-preview'].map((sel) => host.querySelector(sel)!);
    for (const el of order) expect(el).not.toBeNull();
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy();
    }
  });

  it('shows a status while loading and an alert on error', () => {
    const loading = render({ previewSrcdoc: undefined, previewLoading: true });
    expect(loading).toMatch(/role="status"[^>]*>.*Preparing preview…/);
    expect(loading).toContain('aria-busy="true"');
    const failed = render({ previewSrcdoc: undefined, previewError: 'Could not preview that page.' });
    expect(failed).toMatch(/role="alert"[^>]*>.*Could not preview that page\./);
  });
});

// ---------------------------------------------------------------------------
// Client render: tri-state checkbox and click wiring
// ---------------------------------------------------------------------------

describe('ChooseStep: interaction (client render)', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  });

  const realMatchMedia = window.matchMedia;
  const realScrollIntoView = Element.prototype.scrollIntoView;
  const realScrollBy = window.scrollBy;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    host?.remove();
    window.matchMedia = realMatchMedia;
    Element.prototype.scrollIntoView = realScrollIntoView;
    window.scrollBy = realScrollBy;
  });

  /** A layout box `top`..`bottom` px from the viewport's top edge (jsdom lays nothing out, so tests place boxes by hand). */
  function box(top: number, bottom: number): DOMRect {
    return { top, bottom, left: 0, right: 0, x: 0, y: top, width: 0, height: bottom - top, toJSON: () => ({}) } as DOMRect;
  }

  /** The "Sketch" row's title button, its row, and the preview sheet. */
  function sketchRow(): { title: HTMLButtonElement; row: HTMLElement; sheet: HTMLElement } {
    const title = Array.from(host.querySelectorAll<HTMLButtonElement>('button.tree-title')).find((b) => b.textContent?.includes('Sketch'))!;
    return { title, row: title.closest<HTMLElement>('.tree-row')!, sheet: host.querySelector<HTMLElement>('.choose-preview-sheet')! };
  }

  /** Pretend the viewport is narrow (< 992 px) or wide; `reduced` flips prefers-reduced-motion. */
  function viewport(narrow: boolean, reduced = false): void {
    window.matchMedia = ((query: string) => {
      const matches = query.includes('max-width') ? narrow : query.includes('reduced-motion') ? reduced : !narrow;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      } as MediaQueryList;
    }) as typeof window.matchMedia;
  }

  function mount(over: Partial<ChooseStepProps> = {}): ChooseStepProps {
    const props = baseProps(over);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(<ChooseStep {...props} />));
    return props;
  }

  function byLabel(label: string): HTMLElement {
    const el = host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    if (!el) throw new Error(`no element labelled ${label}`);
    return el;
  }

  it('sets the indeterminate property on a partly-checked module', () => {
    mount();
    const m1 = byLabel('Include all in Module 1') as HTMLInputElement;
    expect(m1.checked).toBe(false);
    expect(m1.indeterminate).toBe(true);
    const extras = byLabel('Include all in Extras') as HTMLInputElement;
    expect(extras.indeterminate).toBe(false);
  });

  it('wires chips, rows, titles, and bulk tiles to the callbacks', () => {
    const props = mount();
    act(() => host.querySelector<HTMLButtonElement>('.chip.kind-page')?.click());
    expect(props.onToggleKind).toHaveBeenCalledWith('page', true);
    act(() => host.querySelector<HTMLButtonElement>('.chip.kind-quiz')?.click());
    expect(props.onToggleKind).toHaveBeenCalledWith('quiz', false);

    act(() => (byLabel('Include Sketch') as HTMLInputElement).click());
    expect(props.onToggle).toHaveBeenCalledWith('r-assign', true);
    // A single toggle is announced with the position it landed at (a name change on the focused box is not read out).
    expect(host.querySelector('#choose-status')?.textContent).toBe('Sketch checked, position 3 of 3.');

    act(() => byLabel('Include all in Module 1').click());
    expect(props.onToggleMany).toHaveBeenCalledWith(['r-welcome', 'r-assign'], true);

    const titles = Array.from(host.querySelectorAll<HTMLButtonElement>('button.tree-title'));
    const sketch = titles.find((b) => b.textContent?.includes('Sketch'));
    act(() => sketch?.click());
    expect(props.onFocus).toHaveBeenCalledWith('r-assign');

    const tiles = Array.from(host.querySelectorAll<HTMLButtonElement>('.tile'));
    const selectAll = tiles.find((t) => t.textContent?.includes('Select all shown'));
    act(() => selectAll?.click());
    // Everything the filter shows, in tree order (quiz hidden).
    expect(props.onToggleMany).toHaveBeenLastCalledWith(['r-syl', 'r-welcome', 'r-assign', 'r-file', 'r-link'], true);
    const clear = tiles.find((t) => t.textContent?.includes('Clear shown'));
    act(() => clear?.click());
    expect(props.onToggleMany).toHaveBeenLastCalledWith(['r-syl', 'r-welcome', 'r-assign', 'r-file', 'r-link'], false);
    expect(host.querySelector('#choose-status')?.textContent).toContain('cleared');
  });

  it('collapses and expands a module without losing rows', () => {
    mount();
    const toggle = byLabel('Collapse Module 1');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Expand Module 1');
    const panel = host.querySelector<HTMLElement>('#choose-grp-m1');
    expect(panel?.hidden).toBe(true);
    act(() => toggle.click());
    expect(panel?.hidden).toBe(false);
    expect(host.querySelector('[aria-label="Include Welcome, position 2 of 2"]')).not.toBeNull();
  });

  it('check, check, uncheck first: names and badges renumber, and every toggle is announced with its position or the renumbering', () => {
    function Harness() {
      const [selected, setSelected] = useState<string[]>(['r-syl']);
      const onToggle = (id: string, on: boolean): void =>
        setSelected((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));
      return <ChooseStep {...baseProps({ selected, onToggle, hiddenKinds: new Set<Kind>() })} />;
    }
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(<Harness />));
    const cb = (title: string): HTMLInputElement => host.querySelector<HTMLInputElement>(`input[aria-label^="Include ${title}"]`)!;
    const status = (): string => host.querySelector('#choose-status')?.textContent ?? '';
    const badges = (): string[] => Array.from(host.querySelectorAll('.pos-badge')).map((b) => b.textContent ?? '');
    expect(cb('Course Syllabus').getAttribute('aria-label')).toBe('Include Course Syllabus, position 1 of 1');
    expect(status()).toBe('Preview ready: Welcome.');
    act(() => cb('Welcome').click());
    expect(cb('Welcome').getAttribute('aria-label')).toBe('Include Welcome, position 2 of 2');
    expect(cb('Course Syllabus').getAttribute('aria-label')).toBe('Include Course Syllabus, position 1 of 2');
    expect(status()).toBe('Welcome checked, position 2 of 2.');
    act(() => cb('Handbook').click());
    expect(cb('Handbook').getAttribute('aria-label')).toBe('Include Handbook, position 3 of 3');
    expect(status()).toBe('Handbook checked, position 3 of 3.');
    expect(badges()).toEqual(['1', '2', '3']);
    act(() => cb('Course Syllabus').click()); // uncheck position 1: the rest move up
    expect(cb('Course Syllabus').getAttribute('aria-label')).toBe('Include Course Syllabus');
    expect(cb('Welcome').getAttribute('aria-label')).toBe('Include Welcome, position 1 of 2');
    expect(cb('Handbook').getAttribute('aria-label')).toBe('Include Handbook, position 2 of 2');
    expect(badges()).toEqual(['1', '2']);
    expect(status()).toBe('Course Syllabus unchecked; later pages renumbered. 2 selected.');
    act(() => cb('Handbook').click()); // uncheck the last: nothing renumbers
    expect(status()).toBe('Handbook unchecked. 1 selected.');
    expect(badges()).toEqual(['1']);
    // The "N selected" aside is plain text; the status region is the one live region for the step.
    expect(host.querySelector('.wizard-nav-count')?.textContent).toBe('1 selected');
    expect(host.querySelector('.wizard-nav-count')?.closest('[aria-live], [role="status"]')).toBeNull();
  });

  it('opens the content types disclosure on click and keeps the suffix current', () => {
    mount();
    const btn = host.querySelector<HTMLButtonElement>('button[aria-controls="choose-kinds-panel"]')!;
    const panel = host.querySelector<HTMLElement>('#choose-kinds-panel')!;
    expect(panel.hidden).toBe(true);
    act(() => btn.click());
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll('.chip[aria-pressed]')).toHaveLength(6);
    expect(btn.querySelector('.disclosure-suffix')?.textContent).toBe('5 of 6 shown');
  });

  it('on a narrow screen, picking a title scrolls the preview sheet into view and leaves focus on the title', () => {
    viewport(true);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const props = mount();
    const title = Array.from(host.querySelectorAll<HTMLButtonElement>('button.tree-title')).find((b) => b.textContent?.includes('Sketch'))!;
    act(() => title.focus());
    act(() => title.click());
    expect(props.onFocus).toHaveBeenCalledWith('r-assign');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(host.querySelector('.choose-preview-sheet'));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    expect(document.activeElement).toBe(title);
    // The stacked hint says "above", not "on the left".
    expect(host.querySelector('.choose-preview-hint')?.textContent).toBe('Click a page above to preview its content.');
  });

  it('on a narrow screen, when bringing the sheet up would push the pressed row off the top, scrolls only as far as keeps the row in view', () => {
    viewport(true);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy;
    mount();
    const { title, row, sheet } = sketchRow();
    // jsdom's viewport is 768 px tall. The row sits 40 px from the top; the sheet's bottom edge is 300 px below the fold.
    row.getBoundingClientRect = () => box(40, 84);
    sheet.getBoundingClientRect = () => box(600, 1068);
    act(() => title.focus());
    act(() => title.click());
    // Aligning the sheet would scroll 300 px; the row can only give up 40 − 12 px, so the page moves that far instead.
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 28, behavior: 'smooth' });
    expect(document.activeElement).toBe(title);
  });

  it('on a narrow screen, a pressed row with room above it lets the sheet align normally', () => {
    viewport(true);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy;
    mount();
    const { title, row, sheet } = sketchRow();
    // The row is 500 px down; the sheet's bottom edge is 300 px below the fold: after the scroll the row is still 200 px from the top.
    row.getBoundingClientRect = () => box(500, 544);
    sheet.getBoundingClientRect = () => box(1060, 1068);
    act(() => title.click());
    expect(scrollBy).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(sheet);
  });

  it('honours reduced motion when scrolling the preview into view', () => {
    viewport(true, true);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mount();
    act(() => host.querySelector<HTMLButtonElement>('button.tree-title')?.click());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
  });

  it('never scrolls on a wide screen (the preview is already beside the tree)', () => {
    viewport(false);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const props = mount();
    act(() => host.querySelector<HTMLButtonElement>('button.tree-title')?.click());
    expect(props.onFocus).toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(host.querySelector('.choose-preview-hint')?.textContent).toBe('Click a page on the left to preview its content.');
  });

  it('skips inert bulk tiles', () => {
    const props = mount({ selected: [] });
    const clear = Array.from(host.querySelectorAll<HTMLButtonElement>('.tile')).find((t) => t.textContent?.includes('Clear shown'));
    expect(clear?.getAttribute('aria-disabled')).toBe('true');
    act(() => clear?.click());
    expect(props.onToggleMany).not.toHaveBeenCalled();
  });
});
