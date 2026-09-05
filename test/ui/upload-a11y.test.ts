/**
 * Accessibility and design contract for Step 1 — the hero — and the
 * institution header (DESIGN.md §9, §10), after the "Try a sample" tile was
 * removed and the logo was inlined.
 *
 * 1. axe-core over a static render of UploadStep in four visual states and
 *    over the Header.
 * 2. Structural facts: the drop sheet's reading order, the one primary tile,
 *    the keyboard path (the tile is the only tab stop; the file input is out
 *    of the tab order and hidden from AT), no empty boxes, no trace of the
 *    sample tile in markup or stylesheets.
 * 3. Stylesheet facts read straight from the CSS text, since jsdom has no
 *    layout: the 56 px tile, the centered actions row, the narrow-screen
 *    stack.
 * 4. The header logo: alt text, the data: URI decodes to the shipped SVG,
 *    the intrinsic size matches the viewBox, the link name, no empty slot.
 * 5. Below the generator: the feature band and "How it works" are labelled
 *    sections whose headings keep the outline h2 → h3 → h4 at one size per
 *    level; the cards and steps are not controls (the lists carry an explicit
 *    role="list" so WebKit keeps them lists); the cover card is hidden from AT as a whole,
 *    holds no real course data, and only appears at ≥ 992 px.
 *
 * Colour contrast is disabled here (proven from tokens in tokens.test.ts).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import axe from 'axe-core';
import UploadStep, { DROP_AREA_NAME, DROP_TITLE, HIGHLIGHTS_TITLE } from '../../src/steps/UploadStep';
import { Header } from '../../src/components/shell';
import { LOGO_DATA_URI } from '../../src/ui/assets';
import { EXPECT_ITEMS, EXPORT_STEPS, HERO_FEATURES, HINTS, STATUS } from '../../src/ui/copy';

const ROOT = process.cwd();
const APP_CSS = readFileSync(resolve(ROOT, 'src/styles/app.css'), 'utf8');
const TOKENS_CSS = readFileSync(resolve(ROOT, 'src/styles/tokens.css'), 'utf8');
const UPLOAD_CSS = readFileSync(resolve(ROOT, 'src/steps/UploadStep/UploadStep.css'), 'utf8');
const LOGO_SVG = readFileSync(resolve(ROOT, 'src/assets/coastline-logo.svg'), 'utf8');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** In the app the step sits inside <main> (App.tsx), so the isolated render is mounted the same way for the landmark rule. */
function mount(html: string, tag: 'main' | 'div' = 'main'): HTMLElement {
  document.documentElement.setAttribute('lang', 'en');
  document.title = 'Syllabus Generator';
  const host = document.createElement(tag);
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

async function violations(): Promise<string[]> {
  const result = await axe.run(document, {
    runOnly: { type: 'tag', values: WCAG_TAGS },
    rules: { 'color-contrast': { enabled: false } },
    iframes: false,
  });
  return result.violations.map((v) => `${v.id} [${v.impact}]: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The declarations of the first rule whose selector list equals `selector`, in the given stylesheet text. */
function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule "${selector}"`);
  return m[1].replace(/\s+/g, ' ').trim();
}

/** Every element that would paint as an empty box: no text, no element children, not deliberately empty. */
function emptyBoxes(host: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of Array.from(host.querySelectorAll('div, p, span, ol, ul, li, section'))) {
    if (el.closest('[aria-hidden="true"]')) continue; // hairline, spinner, icons, the decorative cover card
    if (el.hasAttribute('hidden')) continue; // closed disclosure panels
    if (el.childElementCount === 0 && text(el) === '') {
      out.push(el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ').join('.')}` : ''));
    }
  }
  return out;
}

function upload(props: Partial<Parameters<typeof UploadStep>[0]> = {}): string {
  return renderToStaticMarkup(createElement(UploadStep, { onFile: () => {}, busy: false, ...props }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('UploadStep (the hero) accessibility contract', () => {
  it('axe: idle, busy, error, and found states are clean (AA + best practice)', async () => {
    const states = [
      {},
      { busy: true, status: STATUS.reading },
      { error: 'Could not read that course export.' },
      { status: STATUS.found(3, 1) },
    ];
    for (const props of states) {
      mount(upload(props));
      expect(await violations()).toEqual([]);
      document.body.innerHTML = '';
    }
  });

  it('the drop sheet reads in order: art, title, "or", the one primary 56 px tile, the file-type hint; nothing else', () => {
    const host = mount(upload());
    const sheet = host.querySelector('[role="group"].hero-drop')!;
    expect(sheet.getAttribute('aria-label')).toBe(DROP_AREA_NAME);
    const kids = Array.from(sheet.children).map((c) => `${c.tagName.toLowerCase()}.${(c.getAttribute('class') ?? '').split(' ')[0]}`);
    expect(kids).toEqual(['svg.hero-art', 'p.hero-drop-title', 'p.hero-drop-or', 'div.hero-actions', 'input.visually-hidden', 'p.sg-hint']);
    expect(text(sheet.querySelector('.hero-drop-title'))).toBe(DROP_TITLE);
    expect(text(sheet.querySelector('.hero-drop-or'))).toBe('or');
    const actions = sheet.querySelector('.hero-actions')!;
    expect(actions.children.length).toBe(1);
    const tile = actions.firstElementChild as HTMLButtonElement;
    expect(tile.tagName).toBe('BUTTON');
    expect(tile.getAttribute('type')).toBe('button');
    expect(Array.from(tile.classList)).toEqual(expect.arrayContaining(['tile', 'tile-primary', 'tile-lg']));
    expect(text(tile)).toBe('Choose a file');
    expect(tile.querySelector('i.bi')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(sheet.querySelector('#upload-drop-hint'))).toBe(HINTS.fileTypes);
    expect(sheet.getAttribute('aria-describedby')).toBe('upload-drop-hint');
    // No empty containers or stray wrappers anywhere in the step, and no trace of the sample tile.
    expect(emptyBoxes(host)).toEqual([]);
    expect(host.textContent).not.toMatch(/sample/i);
  });

  it('stylesheet: the tile is 56 px and the actions row centers it (and stretches it on narrow screens)', () => {
    expect(TOKENS_CSS).toMatch(/--sg-tile-lg:\s*3\.5rem/);
    expect(rule(APP_CSS, '.tile-lg')).toContain('min-height: var(--sg-tile-lg)');
    const actions = rule(APP_CSS, '.hero-actions');
    expect(actions).toContain('display: flex');
    expect(actions).toContain('justify-content: center');
    expect(rule(APP_CSS, '.hero-drop')).toContain('align-items: center');
    // Narrow: full-width primary, no leftover two-column layout.
    expect(UPLOAD_CSS).toMatch(
      /@media \(max-width: 575\.98px\)[\s\S]*\.hero-step \.hero-actions \{[^}]*width: 100%[^}]*flex-direction: column[^}]*align-items: stretch/,
    );
    expect(UPLOAD_CSS).toMatch(/\.hero-step \.hero-actions \.tile \{\s*width: 100%;/);
    // Nothing in the stylesheets still styles a sample tile.
    expect(APP_CSS + UPLOAD_CSS).not.toMatch(/sample/i);
  });

  it('keyboard path: the tile is the only tab stop in the sheet; the file input is out of the tab order and hidden from AT', () => {
    const host = mount(upload());
    const sheet = host.querySelector('.hero-drop')!;
    expect(sheet.hasAttribute('tabindex')).toBe(false);
    const focusable = Array.from(sheet.querySelectorAll('a, button, input, [tabindex]')).filter((el) => el.getAttribute('tabindex') !== '-1');
    expect(focusable.map((el) => text(el))).toEqual(['Choose a file']);
    const input = sheet.querySelector('input[type="file"]')!;
    expect(input.getAttribute('tabindex')).toBe('-1');
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(input.getAttribute('accept')).toBe('.imscc,.zip');
    // Busy: still focusable, announced as unavailable, never `disabled`.
    const busy = mount(upload({ busy: true }));
    const tile = busy.querySelector('.hero-actions button')!;
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    expect(tile.hasAttribute('disabled')).toBe(false);
    expect(busy.querySelector('.hero-drop')?.getAttribute('aria-busy')).toBe('true');
    expect(busy.querySelector('.hero-drop-or')).toBeNull();
  });

  it('fine print: two closed disclosures with the three export steps and the eleven expectations', () => {
    const host = mount(upload());
    const fine = host.querySelector('.hero-fineprint')!;
    expect(fine.children.length).toBe(2);
    const btns = Array.from(fine.querySelectorAll('button[aria-expanded="false"]'));
    expect(btns.map((b) => text(b))).toEqual(['How to export from Canvas', 'What to expect']);
    expect(Array.from(host.querySelectorAll('#upload-how-to-export li')).map(text)).toEqual([...EXPORT_STEPS]);
    expect(Array.from(host.querySelectorAll('#upload-what-to-expect li')).map(text)).toEqual([...EXPECT_ITEMS]);
    expect(EXPECT_ITEMS.length).toBe(11);
    expect(EXPORT_STEPS.length).toBe(3);
    expect(EXPECT_ITEMS.join(' ')).toContain('Nothing leaves your browser');
  });
});

describe('Below the generator: the highlight tiles and the cover card', () => {
  it('keeps the heading outline h2 → h3 (hidden) → h4 × 4 and labels the tile section by its hidden heading', () => {
    const host = mount(upload());
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(2);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
    expect(levels).toEqual([2, 3, 4, 4, 4, 4]);
    const section = host.querySelector('section[aria-labelledby="hero-highlights-title"]')!;
    expect(section).not.toBeNull();
    const h3 = section.querySelector('h3#hero-highlights-title')!;
    expect(text(h3)).toBe(HIGHLIGHTS_TITLE);
    expect(h3.classList.contains('visually-hidden')).toBe(true);
    // The band holds the step heading, so focus management and aria-labelledby still resolve.
    expect(host.querySelector('.wizard-band h2#wizard-step-1-heading')).not.toBeNull();
    expect(host.querySelector('section[aria-labelledby="wizard-step-1-heading"]')).not.toBeNull();
  });

  it('nothing below the drop sheet is a control: no widget roles, no tab stops, icons decorative', () => {
    const host = mount(upload());
    const section = host.querySelector('.hero-highlights')!;
    expect(section.querySelectorAll('a, button, input, select, textarea, [tabindex], [role]:not([role="list"])').length).toBe(0);
    // The only role is the explicit list role: with list-style none, WebKit would otherwise drop it.
    expect(host.querySelector('ul.hero-features')?.getAttribute('role')).toBe('list');
    expect(host.querySelectorAll('.hero-highlights [role="list"]').length).toBe(1);
    const cards = Array.from(host.querySelectorAll('.hero-features > li'));
    expect(cards.length).toBe(HERO_FEATURES.length);
    for (const card of cards) {
      const icon = card.querySelector('.hero-feature-icon')!;
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.querySelector('i.bi')?.className).toMatch(/\bbi-[a-z-]+/);
      expect(text(card.querySelector('h4'))).not.toBe('');
      expect(text(card.querySelector('p'))).toMatch(/\.$/);
    }
    // The band itself carries no controls either; the sheet overlaps it from above in z.
    expect(host.querySelector('.wizard-band')?.querySelectorAll('a, button, input, [tabindex]:not(h2)').length).toBe(0);
    expect(rule(UPLOAD_CSS, '.hero-step .hero-drop')).toContain('z-index: 1');
    expect(rule(UPLOAD_CSS, '.hero-step .hero-drop')).toContain('margin-top: calc(-1 * var(--sg-space-8))');
    expect(rule(APP_CSS, '.wizard-band')).toContain('padding-bottom: var(--sg-space-8)');
    // Full width comes from block flow, never from viewport-width tricks (those add a scrollbar's width).
    expect(APP_CSS).not.toMatch(/(?:width|margin[a-z-]*):\s*(?:calc\([^)]*)?-?\d*\.?\d*\s*(?:100vw|50vw)/);
    expect(UPLOAD_CSS).not.toMatch(/\d+vw/);
  });

  it('the cover card is decorative: hidden as a whole, no course data, no network, hidden under 992 px', () => {
    const host = mount(upload());
    const cover = host.querySelector('.hero-cover')!;
    expect(cover.getAttribute('aria-hidden')).toBe('true');
    expect(text(cover)).toBe('Course titleInstructor name');
    // Placeholders only: no course code pattern, no term, no person's name, no email.
    expect(text(cover)).not.toMatch(/[A-Z]{2,4}\s?-?\d{2,4}|Fall|Spring|Summer|@|Dr\.|Prof/);
    const img = cover.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toBe(LOGO_DATA_URI);
    expect(host.querySelectorAll('.hero-cover [href], .hero-cover [src]:not([src^="data:"])').length).toBe(0);
    // The mock's title is set like the real styled cover (bold sans); the display serif is for the app's own headings only.
    expect(cover.querySelector('.sg-display')).toBeNull();
    expect(UPLOAD_CSS).toMatch(/\.hero-step \.hero-cover-title \{[^}]*font-weight: 700/);
    // Stylesheet: hidden by default, shown only inside the ≥ 992 px block, and every color is a token.
    expect(rule(UPLOAD_CSS, '.hero-step .hero-cover')).toBe('display: none;');
    const wide = UPLOAD_CSS.slice(UPLOAD_CSS.indexOf('@media (min-width: 992px)'));
    expect(wide).toMatch(/\.hero-step \.hero-cover \{[^}]*display: flex/);
    expect(wide).toMatch(/\.hero-step \.hero-cover-band \{[^}]*background: var\(--sg-hero-shield\)/);
    expect(UPLOAD_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(UPLOAD_CSS).not.toMatch(/rgba?\((?!255, 255, 255, var\(--sg-sheen\)|255, 255, 255, 0\))/);
  });

  it('stylesheet: 1 / 2 / 4 feature columns, tiles lift with the tile shadow, no motion, no leftovers from the old strip', () => {
    expect(rule(UPLOAD_CSS, '.hero-step .hero-features')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(UPLOAD_CSS).toMatch(/@media \(min-width: 576px\)[\s\S]*?\.hero-step \.hero-features \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(UPLOAD_CSS).toMatch(/@media \(min-width: 992px\)[\s\S]*?\.hero-step \.hero-features \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
    const card = rule(UPLOAD_CSS, '.hero-step .hero-feature');
    expect(card).toContain('background-color: var(--sg-paper)');
    expect(card).toContain('rgba(255, 255, 255, var(--sg-sheen))');
    expect(card).toContain('inset 0 1px 0 var(--sg-sheen-line)');
    expect(card).toContain('border-radius: var(--sg-radius-sheet)');
    expect(card).toContain('var(--sg-shadow-tile)');
    expect(card).not.toMatch(/--sg-radius-tile|cursor/);
    expect(UPLOAD_CSS).toMatch(/\[data-bs-theme='dark'\] \.hero-step \.hero-feature \{\s*background-color: var\(--sg-tile\);/);
    expect(UPLOAD_CSS).not.toMatch(/hero-steps|hero-step-item|hero-step-badge|hero-why|hero-how/);
    const below = UPLOAD_CSS.slice(UPLOAD_CSS.indexOf('.hero-step .hero-band {'));
    expect(below).not.toMatch(/transition|animation|transform|:hover/);
    expect(below).not.toMatch(/opacity|backdrop-filter/);
  });
});

describe('Header with the inlined logo', () => {
  it('axe clean; alt "Coastline College"; the data: URI decodes to the shipped SVG; size attrs match the viewBox', async () => {
    const host = mount(renderToStaticMarkup(createElement(Header, { logoHref: 'https://www.coastline.edu/' })), 'div');
    expect(await violations()).toEqual([]);
    const img = host.querySelector('img.sg-header-logo')!;
    expect(img.getAttribute('alt')).toBe('Coastline College');
    expect(img.getAttribute('src')).toBe(LOGO_DATA_URI);
    const src = img.getAttribute('src') ?? '';
    const prefix = 'data:image/svg+xml;base64,';
    expect(src.startsWith(prefix)).toBe(true);
    const decoded = Buffer.from(src.slice(prefix.length), 'base64').toString('utf8');
    expect(decoded).toBe(LOGO_SVG);
    // Nothing inside the SVG needs a network: no <image>, <script>, external fonts or hrefs.
    expect(decoded).not.toMatch(/<image|<script|@import|href="http|font-family/);
    const vb = decoded.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
    const ratio = Number(vb[1]) / Number(vb[2]);
    const w = Number(img.getAttribute('width'));
    const h = Number(img.getAttribute('height'));
    expect(h).toBe(44);
    expect(Math.abs(w / h - ratio)).toBeLessThan(0.02);
    // Link name: image alt + "(opens in a new tab)"; one h1; tagline; no empty slot without children.
    const link = host.querySelector('a.sg-header-logo-link')!;
    expect(text(link)).toBe('(opens in a new tab)');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(host.querySelectorAll('h1').length).toBe(1);
    expect(text(host.querySelector('h1'))).toBe('Syllabus Generator');
    expect(text(host.querySelector('.sg-header-tagline'))).toBe('Institutional Effectiveness');
    expect(host.querySelector('.sg-header-slot')).toBeNull();
    expect(emptyBoxes(host)).toEqual([]);
    // Plain (unlinked) variant too.
    const plain = mount(renderToStaticMarkup(createElement(Header, {})), 'div');
    expect(plain.querySelector('a')).toBeNull();
    expect(plain.querySelector('img')?.getAttribute('alt')).toBe('Coastline College');
  });
});
