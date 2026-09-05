/**
 * Smoke and behaviour tests for Step 3 — Arrange and style.
 * Static: renderToStaticMarkup must not throw and must expose the key ARIA.
 * Behaviour: a real react-dom root under jsdom for keys, clicks, and focus.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import type { Cartridge, CoverInfo, DocOptions, Kind, Resource, ZipIndex } from '../../src/lib/types';
import { PALETTES } from '../../src/lib/generate/colors';
import { PRESENTATION_DESC } from '../../src/ui/copy';
import ArrangeStep, { type ArrangeStepProps } from '../../src/steps/ArrangeStep';
import { LIST_HELP } from '../../src/steps/ArrangeStep/SyllabusList';
import { LivePreview, PREVIEW_CHIP_DELAY_MS } from '../../src/steps/ArrangeStep/LivePreview';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const IDS = ['r-syllabus', 'r-welcome', 'r-quiz'] as const;

function makeCart(): Cartridge {
  const list = [resource(IDS[0], 'Syllabus', 'syllabus'), resource(IDS[1], 'Welcome', 'page'), resource(IDS[2], 'Quiz 1', 'quiz')];
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

const COVER: CoverInfo = { courseTitle: 'Fundamentals of Data Structures', courseCode: 'ICS 123', term: 'Fall 2026', instructor: 'Ada' };
const OPTIONS: DocOptions = { presentation: 'styled', palette: 'sapphire-brass', showCover: true, showToc: true, pageBreaks: false, language: 'en' };
const SRCDOC = '<!doctype html><html><body><p>preview</p></body></html>';

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

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

// ---------------------------------------------------------------------------
// Static render
// ---------------------------------------------------------------------------

describe('ArrangeStep (static)', () => {
  it('renders the step frame, columns, and nav', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps()} />);
    expect(html).toContain('id="wizard-step-3-heading"');
    expect(html).toContain('Arrange and style');
    expect(html).toContain('aria-labelledby="wizard-step-3-heading"');
    expect(html).toContain('Your syllabus');
    expect(html).toContain('Generate syllabus');
    expect(html).toContain('3 pages');
    // The Generate tile itself is live (the nav now precedes the body, so a plain regex would hit the list's disabled Move tiles).
    const nav = document.createElement('div');
    nav.innerHTML = html;
    const generate = Array.from(nav.querySelectorAll('.wizard-nav .tile')).find((t) => t.textContent?.includes('Generate syllabus'));
    expect(generate?.hasAttribute('aria-disabled')).toBe(false);
    expect(html).not.toContain('id="wizard-step-3-next-hint-top"');
  });

  it('lists every page as a 44 px row with index, kind pill, title, and labelled tiles', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps()} />);
    expect(count(html, /class="card-row"/g)).toBe(3);
    expect(html).toContain('class="kind-tag kind-syllabus"');
    expect(html).toContain('class="kind-tag kind-quiz"');
    // The position number is the same badge as step 2's rows (.pos-badge), but here it is the row's position text
    // ("Position n of m.": the number visible, the words visually hidden), never aria-hidden.
    const BADGE =
      /<span class="card-index pos-badge tnum" id="arrange-pos-(\d+)"><span class="visually-hidden">Position <\/span>(\d+)<span class="visually-hidden"> of 3\.<\/span><\/span>/g;
    expect(Array.from(html.matchAll(BADGE)).map((m) => [m[1], m[2]])).toEqual([['1', '1'], ['2', '2'], ['3', '3']]);
    expect(html).not.toMatch(/class="card-index[^>]*aria-hidden/);
    // The list keeps an explicit role (its list-style is none), so VoiceOver's "2 of 5" never depends on a heuristic.
    expect(html).toContain('<ol class="card-list" role="list" aria-labelledby="arrange-list-title">');
    expect(html).not.toContain('>1.<');
    expect(html).toContain('aria-label="Move up: Syllabus"');
    expect(html).toContain('aria-label="Move down: Welcome"');
    expect(html).toContain('aria-label="Remove: Quiz 1"');
    // Edges are inert but still focusable (aria-disabled, never disabled).
    expect(html).toMatch(/aria-label="Move up: Syllabus" aria-describedby="arrange-pos-1 arrange-list-help" aria-disabled="true"/);
    expect(html).toMatch(/aria-label="Move down: Quiz 1" aria-describedby="arrange-pos-3 arrange-list-help" aria-disabled="true"/);
    expect(html).not.toMatch(/aria-label="Move down: Syllabus"[^>]*aria-disabled/);
    expect(html).not.toContain(' disabled=""');
    // Rows take focus by click or script only (the tiles are the tab stops). Every tile is described by its row's
    // position badge; the Move tiles by the Alt+Arrow hint as well.
    expect(count(html, /class="card-row" data-id="[^"]+" tabindex="-1"/g)).toBe(3);
    expect(html).not.toMatch(/class="card-row"[^>]*tabindex="0"/);
    expect(count(html, /aria-describedby="arrange-pos-\d+ arrange-list-help"/g)).toBe(6);
    expect(count(html, /aria-describedby="arrange-pos-\d+"/g)).toBe(3);
    expect(html).toMatch(/aria-label="Move up: Welcome" aria-describedby="arrange-pos-2 arrange-list-help"/);
    expect(html).toMatch(/aria-label="Remove: Welcome" aria-describedby="arrange-pos-2"/);
    expect(html).toContain('id="arrange-list-help"');
    expect(html).toMatch(/aria-live="polite" aria-atomic="true" role="status"/);
  });

  it('renders the cover form with labelled 44 px inputs and a language select', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps()} />);
    for (const id of ['arrange-instructor', 'arrange-email', 'arrange-office-hours', 'arrange-meeting-times']) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}" class="form-control"`);
    }
    expect(html).toContain('>Instructor name<');
    expect(html).toContain('Shown under the course title on the cover.');
    expect(html).toContain('>Email<');
    expect(html).toContain('>Office hours<');
    expect(html).toContain('>Meeting times<');
    expect(html).toContain('value="Ada"');
    expect(html).toContain('for="arrange-language"');
    expect(html).toContain('<select id="arrange-language" class="form-select"');
    expect(html).toMatch(/<option value="en" selected="">English \(en\)<\/option>/);
    expect(html).toContain('Fundamentals of Data Structures');
    expect(html).toContain('ICS 123');
    expect(html).not.toMatch(/<fieldset class="arrange-cover"[^]*id="arrange-logo"/);
  });

  it('offers an unknown current language as an option rather than showing the wrong one', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps({ options: { ...OPTIONS, language: 'haw' } })} />);
    expect(html).toMatch(/<option value="haw" selected="">haw \(haw\)<\/option>/);
  });

  it('renders the look gallery as a radiogroup: Original first, then one radio per palette', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps()} />);
    expect(html).toContain('role="radiogroup" aria-label="Look"');
    expect(count(html, /role="radio"/g)).toBe(PALETTES.length + 1);
    expect(count(html, /aria-checked="true"/g)).toBe(1);
    expect(html).toMatch(/id="arrange-look-sapphire-brass"[^>]*aria-checked="true"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="arrange-look-original"[^>]*aria-checked="false"[^>]*tabindex="-1"/);
    expect(html.indexOf('arrange-look-original')).toBeLessThan(html.indexOf('arrange-look-ink-paper'));
    // Honest label (DESIGN.md §2 principle 6): Original means "your inline formatting", never "looks like Canvas".
    expect(html).toContain(PRESENTATION_DESC.original);
    expect(html).not.toContain('exactly as it is in Canvas');
    for (const p of PALETTES) {
      expect(html).toContain(`id="arrange-look-${p.id}"`);
      expect(html).toContain(p.name.replace('&', '&amp;'));
      expect(html).toContain(`background:${p.primary}`);
    }
    // Only the active radio is in the tab order.
    expect(count(html, /role="radio" aria-checked="(true|false)" tabindex="0"/g)).toBe(1);
  });

  it('checks Original when the presentation is original', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps({ options: { ...OPTIONS, presentation: 'original' } })} />);
    expect(html).toMatch(/id="arrange-look-original"[^>]*aria-checked="true"[^>]*tabindex="0"/);
    expect(count(html, /aria-checked="true"/g)).toBe(1);
  });

  it('renders the four layout switches with their state; the logo switch follows Cover page and shows the mark', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps()} />);
    expect(count(html, /role="switch"/g)).toBe(4);
    expect(html).toMatch(/id="arrange-cover-page" type="checkbox" role="switch"[^>]*checked=""/);
    expect(html).toMatch(/id="arrange-logo" type="checkbox" role="switch"[^>]*checked=""/);
    expect(html).toContain('>Coastline College logo<');
    expect(html).toContain('On the cover, above the course title.');
    // Inside the Layout fieldset, right after Cover page, with the inlined mark (decorative) beside it.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ids = Array.from(doc.querySelectorAll('.arrange-toggles [role="switch"]')).map((el) => el.id);
    expect(ids).toEqual(['arrange-cover-page', 'arrange-logo', 'arrange-toc', 'arrange-page-breaks']);
    const thumb = doc.querySelector('#arrange-logo ~ .switch-aside img') as HTMLImageElement;
    expect(thumb.getAttribute('alt')).toBe('');
    expect(thumb.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(thumb.parentElement?.className).toBe('sg-logo-plate arrange-logo-thumb');
    expect(html).toMatch(/id="arrange-toc" type="checkbox" role="switch"[^>]*checked=""/);
    expect(html).toMatch(/id="arrange-page-breaks" type="checkbox" role="switch"(?![^>]*checked="")/);
    expect(html).toContain('Cover page');
    expect(html).toContain('Table of contents');
    expect(html).toContain('Page break between sections');
  });

  it('always renders the live preview pane: heading, hint, and a script-free same-origin iframe on a sheet', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps()} />);
    expect(html).toContain('<h3 class="wizard-col-title" id="arrange-preview-title">Preview</h3>');
    expect(html).toContain('aria-labelledby="arrange-preview-title"');
    expect(html).toContain('Updates as you change the look, order, and cover.');
    // Same-origin only (for scroll preservation); never allow-scripts. The srcdoc is the assembled, guarded document.
    expect(html).toMatch(
      /<iframe class="sg-sheet-frame arrange-preview-frame" sandbox="allow-same-origin" srcdoc="[^"]+" title="Live preview"/i,
    );
    expect(html).not.toContain('allow-scripts');
    expect(html).toContain('class="sg-desk arrange-preview-desk"');
    expect(html).toContain('class="sg-sheet arrange-preview-sheet sg-sheet-enter"');
    expect(html).toContain('class="arrange-preview-status" role="status" aria-live="polite" aria-atomic="true"');
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('<script');
    // No disclosure anywhere around the preview.
    expect(html).not.toContain('arrange-preview-panel');
    expect(html).not.toContain('aria-expanded');
  });

  it('marks the document busy while a newer one is on its way, keeping the old one on screen; the chip waits', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps({ livePreviewLoading: true })} />);
    // Busy sits on the part being replaced, never on the sheet (an ancestor of the live region).
    expect(html).toContain('<div class="arrange-preview-doc" aria-busy="true">');
    expect(html).toContain('class="sg-sheet arrange-preview-sheet sg-sheet-enter"><div class="arrange-preview-status"');
    expect(html).toMatch(/<iframe [^>]*srcdoc="[^"]+"/i);
    // The chip is not immediate: a quick rebuild never flashes or announces it (see the behaviour test).
    expect(html).not.toContain('Updating preview…');
  });

  it('exposes every section title to heading navigation: Look, Preview, Layout, Your syllabus, Cover', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps()} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const hs = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    expect(hs.map((h) => h.tagName)).toEqual(['H2', 'H3', 'H3', 'H3', 'H3', 'H3']);
    expect(hs.slice(1).map((h) => h.textContent)).toEqual(['Look', 'Preview', 'Layout', 'Your syllabus', 'Cover']);
    // Layout and Cover stay fieldsets named by their legend; the heading lives inside it.
    expect(Array.from(doc.querySelectorAll('legend')).map((l) => l.textContent)).toEqual(['Layout', 'Cover']);
    expect(doc.querySelectorAll('legend > h3')).toHaveLength(2);
  });

  it('orders the sections Look, Preview, Layout, Your syllabus, Cover in the DOM (the narrow-screen order)', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps()} />);
    const at = (needle: string): number => {
      const i = html.indexOf(needle);
      if (i < 0) throw new Error(`Missing ${needle}`);
      return i;
    };
    const look = at('id="arrange-look-title"');
    const preview = at('id="arrange-preview-title"');
    const layout = at('<legend class="wizard-col-title"><h3>Layout</h3></legend>');
    const list = at('id="arrange-list-title"');
    const cover = at('<legend class="wizard-col-title"><h3>Cover</h3></legend>');
    expect(look).toBeLessThan(preview);
    expect(preview).toBeLessThan(layout);
    expect(layout).toBeLessThan(list);
    expect(list).toBeLessThan(cover);
    // Each section is its own grid area so CSS can place the preview in a sticky right column on wide screens.
    for (const area of ['look', 'preview', 'toggles', 'list', 'cover']) {
      expect(count(html, new RegExp(`class="wizard-col arrange-area arrange-area-${area}"`, 'g'))).toBe(1);
    }
  });

  it('says what to do next when nothing is selected and keeps Generate inert with a hint', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps({ order: [], livePreviewSrcdoc: undefined })} />);
    expect(html).toContain('Nothing here yet. Go back to Choose pages and check the pages you want.');
    expect(html).toContain('Add a page on the Choose pages step to see a preview.');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('id="wizard-step-3-next-hint-top"');
    expect(html).toContain('id="wizard-step-3-next-hint-bottom"');
    expect(html).toContain('Add at least one page first.');
    expect(html).toMatch(/aria-disabled="true" aria-describedby="wizard-step-3-next-hint-top"/);
    expect(html).toMatch(/aria-disabled="true" aria-describedby="wizard-step-3-next-hint-bottom"/);
    expect(html).toContain('0 pages');
  });

  it('renders without Back or Generate when the callbacks are omitted', () => {
    const html = renderToStaticMarkup(<ArrangeStep {...makeProps({ onBack: undefined, onGenerate: undefined })} />);
    expect(html).not.toContain('Generate syllabus');
    expect(html).not.toContain('>Back<');
    expect(html).toContain('3 pages');
  });
});

// ---------------------------------------------------------------------------
// Behaviour (real DOM root)
// ---------------------------------------------------------------------------

interface Mounted {
  host: HTMLDivElement;
  root: Root;
  rerender: (props: ArrangeStepProps) => void;
  unmount: () => void;
}

const mounted: Mounted[] = [];

function mount(props: ArrangeStepProps): Mounted {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ArrangeStep {...props} />);
  });
  const m: Mounted = {
    host,
    root,
    rerender: (p) => {
      act(() => {
        root.render(<ArrangeStep {...p} />);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
  mounted.push(m);
  return m;
}

function press(el: Element, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

function click(el: Element): void {
  act(() => {
    (el as HTMLElement).click();
  });
}

const $ = (host: Element, sel: string): HTMLElement => {
  const el = host.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
};

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('ArrangeStep (behaviour)', () => {
  it('Alt+ArrowDown on a focused row moves it, announces the new position, and keeps focus on it', () => {
    const props = makeProps();
    const m = mount(props);
    const row = $(m.host, '[data-id="r-syllabus"]');
    row.focus();
    press(row, 'ArrowDown', { altKey: true });
    expect(props.onMove).toHaveBeenCalledWith('r-syllabus', 1);
    expect($(m.host, '.arrange-list [role="status"]').textContent).toBe('Moved Syllabus to position 2.');

    // The parent applies the move; focus follows the row to its new place.
    m.rerender({ ...props, order: ['r-welcome', 'r-syllabus', 'r-quiz'] });
    const moved = $(m.host, '[data-id="r-syllabus"]');
    expect(document.activeElement).toBe(moved);
    expect(moved.previousElementSibling?.getAttribute('data-id')).toBe('r-welcome');
  });

  it('Alt+ArrowDown from a Move tile moves the row and puts focus back on the same tile', () => {
    const props = makeProps();
    const m = mount(props);
    const tile = $(m.host, '[aria-label="Move down: Syllabus"]');
    tile.focus();
    press(tile, 'ArrowDown', { altKey: true });
    expect(props.onMove).toHaveBeenCalledWith('r-syllabus', 1);
    m.rerender({ ...props, order: ['r-welcome', 'r-syllabus', 'r-quiz'] });
    expect(document.activeElement).toBe($(m.host, '[aria-label="Move down: Syllabus"]'));
    expect(document.activeElement?.closest('.card-row')?.getAttribute('data-id')).toBe('r-syllabus');
  });

  it('a moved row keeps its tiles described by its new position: the badge text follows the row', () => {
    const props = makeProps();
    const m = mount(props);
    const describedBy = (tile: HTMLElement): string =>
      (tile.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => m.host.querySelector(`#${id}`)?.textContent ?? '')
        .join(' ');
    expect($(m.host, '[data-id="r-syllabus"] .pos-badge').textContent).toBe('Position 1 of 3.');
    expect(describedBy($(m.host, '[aria-label="Move down: Syllabus"]'))).toBe(`Position 1 of 3. ${LIST_HELP}`);
    expect(describedBy($(m.host, '[aria-label="Remove: Syllabus"]'))).toBe('Position 1 of 3.');
    m.rerender({ ...props, order: ['r-welcome', 'r-syllabus', 'r-quiz'] });
    expect($(m.host, '[data-id="r-syllabus"] .pos-badge').textContent).toBe('Position 2 of 3.');
    expect(describedBy($(m.host, '[aria-label="Move down: Syllabus"]'))).toBe(`Position 2 of 3. ${LIST_HELP}`);
    expect(describedBy($(m.host, '[aria-label="Move up: Welcome"]'))).toBe(`Position 1 of 3. ${LIST_HELP}`);
    m.rerender({ ...props, order: ['r-welcome', 'r-syllabus'] });
    expect($(m.host, '[data-id="r-syllabus"] .pos-badge').textContent).toBe('Position 2 of 2.');
  });

  it('Alt+ArrowUp on the first row does nothing but says why; plain arrows are left alone', () => {
    const props = makeProps();
    const m = mount(props);
    const row = $(m.host, '[data-id="r-syllabus"]');
    press(row, 'ArrowUp', { altKey: true });
    expect(props.onMove).not.toHaveBeenCalled();
    expect($(m.host, '.arrange-list [role="status"]').textContent).toBe('Syllabus is already first.');
    press(row, 'ArrowDown');
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('Move/Remove tiles call back with the id; inert edge tiles do nothing', () => {
    const props = makeProps();
    const m = mount(props);
    click($(m.host, '[aria-label="Move up: Syllabus"]'));
    expect(props.onMove).not.toHaveBeenCalled();
    click($(m.host, '[aria-label="Move down: Syllabus"]'));
    expect(props.onMove).toHaveBeenCalledWith('r-syllabus', 1);
    click($(m.host, '[aria-label="Move up: Quiz 1"]'));
    expect(props.onMove).toHaveBeenCalledWith('r-quiz', -1);
    click($(m.host, '[aria-label="Remove: Welcome"]'));
    expect(props.onRemove).toHaveBeenCalledWith('r-welcome');
    expect($(m.host, '.arrange-list [role="status"]').textContent).toBe('Removed Welcome.');
  });

  it('after removing the last remaining page, focus lands on the empty-state hint', () => {
    const props = makeProps({ order: ['r-quiz'] });
    const m = mount(props);
    click($(m.host, '[aria-label="Remove: Quiz 1"]'));
    m.rerender({ ...props, order: [] });
    expect(document.activeElement).toBe($(m.host, '.arrange-list-empty'));
  });

  it('arrow keys in the look gallery select the neighbour and move focus (wrapping at the ends)', () => {
    const props = makeProps();
    const m = mount(props);
    const sapphire = PALETTES.findIndex((p) => p.id === 'sapphire-brass');
    const current = $(m.host, '#arrange-look-sapphire-brass');
    current.focus();

    press(current, 'ArrowRight');
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'styled', palette: PALETTES[sapphire + 1].id });
    expect(document.activeElement?.id).toBe(`arrange-look-${PALETTES[sapphire + 1].id}`);

    press(current, 'ArrowUp');
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'styled', palette: PALETTES[sapphire - 1].id });

    const original = $(m.host, '#arrange-look-original');
    press(original, 'ArrowLeft');
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'styled', palette: PALETTES[PALETTES.length - 1].id });
    press(original, 'ArrowDown');
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'styled', palette: PALETTES[0].id });

    const last = $(m.host, `#arrange-look-${PALETTES[PALETTES.length - 1].id}`);
    press(last, 'ArrowRight');
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'original' });
    expect(document.activeElement?.id).toBe('arrange-look-original');

    press(current, 'End');
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'styled', palette: PALETTES[PALETTES.length - 1].id });
    press(current, 'Home');
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'original' });
  });

  it('clicking a look tile selects it', () => {
    const props = makeProps();
    const m = mount(props);
    click($(m.host, '#arrange-look-original'));
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'original' });
    click($(m.host, '#arrange-look-jade-gold'));
    expect(props.onOptions).toHaveBeenLastCalledWith({ presentation: 'styled', palette: 'jade-gold' });
  });

  it('cover inputs, the language select, and the switches patch the right props', () => {
    const props = makeProps();
    const m = mount(props);

    const email = $(m.host, '#arrange-email') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(email, 'ada@coastline.edu');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(props.onCover).toHaveBeenLastCalledWith({ email: 'ada@coastline.edu' });

    const select = $(m.host, '#arrange-language') as HTMLSelectElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'es');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(props.onOptions).toHaveBeenLastCalledWith({ language: 'es' });

    click($(m.host, '#arrange-toc'));
    expect(props.onOptions).toHaveBeenLastCalledWith({ showToc: false });
    click($(m.host, '#arrange-page-breaks'));
    expect(props.onOptions).toHaveBeenLastCalledWith({ pageBreaks: true });
    click($(m.host, '#arrange-cover-page'));
    expect(props.onOptions).toHaveBeenLastCalledWith({ showCover: false });
    click($(m.host, '#arrange-logo'));
    expect(props.onIncludeLogo).toHaveBeenLastCalledWith(false);
  });

  it('Back and Generate call their callbacks; Generate is inert when the list is empty', () => {
    const props = makeProps();
    const m = mount(props);
    click($(m.host, '.wizard-nav-back button'));
    expect(props.onBack).toHaveBeenCalledTimes(1);
    click($(m.host, '.wizard-nav-next button'));
    expect(props.onGenerate).toHaveBeenCalledTimes(1);

    const empty = makeProps({ order: [] });
    const m2 = mount(empty);
    click($(m2.host, '.wizard-nav-next button'));
    expect(empty.onGenerate).not.toHaveBeenCalled();
  });

  it('shows the preview at every width with no disclosure, keeps the same iframe (old document) across updates, and shows the chip only for a noticeable wait', () => {
    // Narrow-screen media query: the preview must still be on screen, not behind a button.
    (window as { matchMedia?: unknown }).matchMedia = () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.useFakeTimers();
    try {
      const props = makeProps();
      const m = mount(props);
      expect(m.host.querySelector('button[aria-expanded]')).toBeNull();
      expect(m.host.querySelector('#arrange-preview-panel')).toBeNull();
      const frame = $(m.host, 'iframe[title="Live preview"]') as HTMLIFrameElement;
      expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
      expect(frame.getAttribute('srcdoc')).toBe(SRCDOC);
      const sheet = $(m.host, '.arrange-preview-sheet');
      const doc = $(m.host, '.arrange-preview-doc');
      const status = $(m.host, '.arrange-preview-status');
      expect(doc.getAttribute('aria-busy')).toBeNull();
      expect(status.textContent).toBe('');

      // A newer document is on its way: the old one stays and the part being replaced goes busy at once …
      m.rerender({ ...props, livePreviewLoading: true });
      expect(m.host.querySelector('iframe[title="Live preview"]')).toBe(frame);
      expect(frame.getAttribute('srcdoc')).toBe(SRCDOC);
      expect(doc.getAttribute('aria-busy')).toBe('true');
      // … never an ancestor of the live region (AT may hold back changes inside a busy subtree).
      expect(sheet.getAttribute('aria-busy')).toBeNull();
      expect(status.getAttribute('role')).toBe('status');
      expect(sheet.contains(status)).toBe(true);
      expect(doc.contains(status)).toBe(false);
      // … but the chip waits: a quick rebuild never flashes or announces it.
      expect(status.textContent).toBe('');
      act(() => {
        vi.advanceTimersByTime(PREVIEW_CHIP_DELAY_MS - 1);
      });
      expect(status.textContent).toBe('');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(status.textContent).toContain('Updating preview…');
      expect($(m.host, '.arrange-preview-chip .spinner-border').getAttribute('aria-hidden')).toBe('true');

      // It lands: same element, new srcdoc, chip gone, not busy.
      const next = SRCDOC.replace('preview', 'preview v2');
      m.rerender({ ...props, livePreviewSrcdoc: next, livePreviewLoading: false });
      expect(m.host.querySelector('iframe[title="Live preview"]')).toBe(frame);
      expect(frame.getAttribute('srcdoc')).toBe(next);
      expect(doc.getAttribute('aria-busy')).toBeNull();
      expect(status.textContent).toBe('');

      // A fast update (under the threshold) is busy while it lasts but never shows or announces the chip.
      m.rerender({ ...props, livePreviewSrcdoc: next, livePreviewLoading: true });
      expect(doc.getAttribute('aria-busy')).toBe('true');
      act(() => {
        vi.advanceTimersByTime(PREVIEW_CHIP_DELAY_MS / 2);
      });
      m.rerender({ ...props, livePreviewSrcdoc: next.replace('v2', 'v3'), livePreviewLoading: false });
      act(() => {
        vi.advanceTimersByTime(PREVIEW_CHIP_DELAY_MS * 2);
      });
      expect(status.textContent).toBe('');
      expect(doc.getAttribute('aria-busy')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('LivePreview: a load after the frame navigated cross-origin (an external link) neither throws nor breaks the next same-origin load', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push({
      host,
      root,
      rerender: () => undefined,
      unmount: () => {
        act(() => {
          root.unmount();
        });
        host.remove();
      },
    });
    act(() => {
      root.render(<LivePreview srcdoc={SRCDOC} hasPages />);
    });
    const frame = $(host, 'iframe[title="Live preview"]') as HTMLIFrameElement;
    const real = frame.contentWindow;
    if (!real) throw new Error('no contentWindow');

    // Browser WindowProxy model: one stable object per frame; forwards to the current
    // Window while same-origin, throws SecurityError for any access once cross-origin.
    let crossOrigin = false;
    const proxy = new Proxy(real as unknown as Record<string | symbol, unknown>, {
      get(target, prop) {
        if (crossOrigin) throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError');
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
    Object.defineProperty(frame, 'contentWindow', { get: () => proxy, configurable: true });
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent): void => {
      errors.push(e.error ?? e.message);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    const load = (): void => {
      try {
        act(() => {
          frame.dispatchEvent(new Event('load'));
        });
      } catch (e) {
        errors.push(e);
      }
    };
    try {
      // 1) The srcdoc loads same-origin: listeners attach through the proxy.
      load();
      // 2) The reader follows an external link inside the preview: the frame is now cross-origin.
      crossOrigin = true;
      load();
      expect(errors).toEqual([]);
      // 3) The next document lands (same-origin again): scroll tracking resumes as if nothing happened.
      crossOrigin = false;
      load();
      Object.defineProperty(real, 'scrollY', { value: 77, configurable: true });
      act(() => {
        real.dispatchEvent(new Event('pagehide'));
      });
      const scrollTo = vi.fn();
      Object.defineProperty(real, 'scrollTo', { value: scrollTo, configurable: true, writable: true });
      load();
      expect(scrollTo).toHaveBeenCalledWith(0, 77);
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('error', onError);
    }
  });

  it('restores the scroll position of the previous document when the next one loads', () => {
    const props = makeProps();
    const m = mount(props);
    const frame = $(m.host, 'iframe[title="Live preview"]') as HTMLIFrameElement;
    const win = frame.contentWindow;
    if (!win) throw new Error('no contentWindow');
    const scrollTo = vi.fn();
    Object.defineProperty(win, 'scrollTo', { value: scrollTo, configurable: true, writable: true });
    // First load: nothing recorded yet, so nothing to restore.
    act(() => {
      frame.dispatchEvent(new Event('load'));
    });
    expect(scrollTo).not.toHaveBeenCalled();

    // The reader scrolls, then the old document is hidden as the next srcdoc swaps in.
    Object.defineProperty(win, 'scrollY', { value: 120, configurable: true });
    act(() => {
      win.dispatchEvent(new Event('pagehide'));
    });
    m.rerender({ ...props, livePreviewSrcdoc: SRCDOC.replace('preview', 'preview v2') });
    act(() => {
      frame.dispatchEvent(new Event('load'));
    });
    expect(scrollTo).toHaveBeenCalledWith(0, 120);

    // A scroll event on the new document updates the record used by the load after that.
    Object.defineProperty(win, 'scrollY', { value: 48, configurable: true });
    act(() => {
      win.dispatchEvent(new Event('scroll'));
    });
    m.rerender({ ...props, livePreviewSrcdoc: SRCDOC.replace('preview', 'preview v3') });
    act(() => {
      frame.dispatchEvent(new Event('load'));
    });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 48);
  });
});
