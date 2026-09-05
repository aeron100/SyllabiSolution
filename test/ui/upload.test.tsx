import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import UploadStep, { DROP_AREA_NAME, DROP_TITLE, HIGHLIGHTS_TITLE, KICKER, WRONG_FILE_MESSAGE } from '../../src/steps/UploadStep';
import { APP_NAME, EXPECT_ITEMS, EXPORT_STEPS, HERO_FEATURES, HINTS, REASSURANCE, STATUS } from '../../src/ui/copy';
import { LOGO_DATA_URI } from '../../src/ui/assets';

function render(props: Partial<Parameters<typeof UploadStep>[0]> = {}): HTMLElement {
  const html = renderToStaticMarkup(<UploadStep onFile={() => {}} busy={false} {...props} />);
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('UploadStep (step 1, the hero)', () => {
  it('renders the hero: kicker, app name as the step heading, and the promise', () => {
    const host = render();
    expect(text(host.querySelector('.wizard-kicker'))).toBe(KICKER);
    const h2 = host.querySelector('h2#wizard-step-1-heading');
    expect(h2).not.toBeNull();
    expect(text(h2)).toBe(APP_NAME);
    expect(h2?.getAttribute('tabindex')).toBe('-1');
    const section = host.querySelector('section[aria-labelledby="wizard-step-1-heading"]');
    expect(section).not.toBeNull();
    // With the band, the labelled section is the shell; the body column keeps the hero class.
    expect(section?.classList.contains('wizard-shell')).toBe(true);
    expect(host.querySelector('.wizard.hero')).not.toBeNull();
    expect(text(host.querySelector('.wizard-intro'))).toBe(REASSURANCE);
    expect(host.querySelector('svg.hero-art')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the drop target as a named, described sheet of paper that is not itself a tab stop', () => {
    const host = render();
    const drop = host.querySelector('[role="group"].hero-drop');
    expect(drop).not.toBeNull();
    expect(drop?.classList.contains('sg-sheet')).toBe(true);
    expect(drop?.classList.contains('sg-sheet-dashed')).toBe(true);
    // A group is not operable, so it takes no tabindex: the "Choose a file" tile inside is the keyboard path.
    expect(drop?.hasAttribute('tabindex')).toBe(false);
    expect(drop?.getAttribute('aria-label')).toBe(DROP_AREA_NAME);
    expect(drop?.hasAttribute('aria-busy')).toBe(false);
    const described = (drop?.getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(described).toEqual(['upload-drop-hint']);
    for (const id of described) expect(host.querySelector(`#${id}`)).not.toBeNull();
    expect(text(drop?.querySelector('.hero-drop-title') ?? null)).toBe(DROP_TITLE);
    expect(text(host.querySelector('#upload-drop-hint'))).toBe(HINTS.fileTypes);
    expect(host.querySelector('#upload-drop-keys')).toBeNull();
  });

  it('has one real primary "Choose a file" tile (no sample tile) and a hidden file input', () => {
    const host = render();
    const buttons = Array.from(host.querySelectorAll('.hero-drop button'));
    expect(buttons.map((b) => text(b))).toEqual(['Choose a file']);
    const choose = buttons[0];
    expect(host.querySelectorAll('.hero-actions > *').length).toBe(1);
    expect(choose?.getAttribute('type')).toBe('button');
    expect(choose?.classList.contains('tile-primary')).toBe(true);
    expect(choose?.classList.contains('tile-lg')).toBe(true);
    expect(choose?.hasAttribute('aria-disabled')).toBe(false);
    // The app never downloads anything on its own: no sample, no fetch.
    expect(host.textContent).not.toContain('Try a sample');
    // icons are decorative and never stand alone
    expect(choose?.querySelector('i.bi')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(choose ?? null).length).toBeGreaterThan(0);
    const input = host.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('accept')).toBe('.imscc,.zip');
    expect(input?.className).toContain('visually-hidden');
    expect(input?.getAttribute('tabindex')).toBe('-1');
    expect(input?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the two disclosures with the export steps and the eleven expectations', () => {
    const host = render();
    const fine = host.querySelector('.hero-fineprint');
    const btns = Array.from(fine?.querySelectorAll('button[aria-expanded]') ?? []);
    expect(btns.map((b) => text(b))).toEqual(['How to export from Canvas', 'What to expect']);
    for (const b of btns) {
      expect(b.getAttribute('aria-expanded')).toBe('false');
      const panel = host.querySelector(`#${b.getAttribute('aria-controls')}`);
      expect(panel).not.toBeNull();
      expect(panel?.hasAttribute('hidden')).toBe(true);
    }
    const exportItems = Array.from(host.querySelectorAll('#upload-how-to-export li')).map((li) => text(li));
    expect(exportItems).toEqual([...EXPORT_STEPS]);
    const expectItems = Array.from(host.querySelectorAll('#upload-what-to-expect li')).map((li) => text(li));
    expect(expectItems).toEqual([...EXPECT_ITEMS]);
    expect(expectItems.length).toBe(11);
  });

  it('while busy: aria-busy, a spinner, the reading message, and inert tiles', () => {
    const host = render({ busy: true, status: STATUS.reading });
    const drop = host.querySelector('.hero-drop');
    expect(drop?.getAttribute('aria-busy')).toBe('true');
    expect(drop?.classList.contains('is-busy')).toBe(true);
    expect(drop?.querySelector('.spinner-border')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(drop?.querySelector('.hero-status') ?? null)).toBe(STATUS.reading);
    expect(drop?.querySelector('.hero-drop-title')).toBeNull();
    for (const b of Array.from(drop?.querySelectorAll('button') ?? [])) {
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.hasAttribute('disabled')).toBe(false); // still focusable
    }
    // No status given: falls back to the reading copy.
    expect(text(render({ busy: true }).querySelector('.hero-status'))).toBe(STATUS.reading);
  });

  it('shows a status line when idle, but never echoes the error twice', () => {
    const found = STATUS.found(33, 9);
    expect(text(render({ status: found }).querySelector('.hero-status'))).toBe(found);
    const host = render({ status: 'Could not read that course export.', error: 'Could not read that course export.' });
    expect(host.querySelector('.hero-status')).toBeNull();
    expect(host.querySelectorAll('[role="alert"]').length).toBe(1);
  });

  it('renders an error as a dismissible alert', () => {
    const host = render({ error: 'Could not read that course export. Not a zip file.' });
    const alert = host.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.classList.contains('notice-error')).toBe(true);
    expect(text(alert)).toContain('Could not read that course export. Not a zip file.');
    const dismiss = alert?.querySelector('button[aria-label]');
    expect(dismiss?.getAttribute('aria-label')).toBe('Dismiss error');
    expect(render().querySelector('[role="alert"]')).toBeNull();
  });

  it('lays the hero out: navy band (kicker, title, attribution, cover card), then the drop sheet, the fine print, and the tiles', () => {
    const host = render();
    const band = host.querySelector('.wizard-band')!;
    expect(band).not.toBeNull();
    expect(band.querySelector('h2#wizard-step-1-heading')).not.toBeNull();
    expect(text(band.querySelector('.wizard-intro'))).toBe(REASSURANCE);
    expect(band.querySelector('.wizard-band-aside .hero-cover')).not.toBeNull();
    const body = host.querySelector('.wizard-body')!;
    const kids = Array.from(body.children).map((c) => `${c.tagName.toLowerCase()}.${(c.getAttribute('class') ?? '').split(' ')[0]}`);
    expect(kids).toEqual(['div.hero-drop', 'div.hero-fineprint', 'section.hero-band']);
    expect(body.children[2]?.classList.contains('hero-highlights')).toBe(true);
    // An error sits right under the sheet.
    const withError = render({ error: 'x' });
    const order = Array.from(withError.querySelector('.wizard-body')!.children).map((c) => c.className.split(' ')[0]);
    expect(order).toEqual(['hero-drop', 'notice', 'hero-fineprint', 'hero-band']);
  });

  it('highlights: a visually-hidden h3 and the four tiles in order, as cards that are not controls', () => {
    const host = render();
    const section = host.querySelector('section[aria-labelledby="hero-highlights-title"]')!;
    expect(section).not.toBeNull();
    const h3 = section.querySelector('h3#hero-highlights-title')!;
    expect(text(h3)).toBe(HIGHLIGHTS_TITLE);
    expect(h3.classList.contains('visually-hidden')).toBe(true);
    const cards = Array.from(section.querySelectorAll('ul.hero-features > li.hero-feature'));
    expect(cards.length).toBe(4);
    expect(cards.map((c) => text(c.querySelector('h4.hero-feature-title')))).toEqual(HERO_FEATURES.map((f) => f.title));
    expect(cards.map((c) => text(c.querySelector('p.hero-feature-text')))).toEqual(HERO_FEATURES.map((f) => f.text));
    // Plain claims only (no overpromising).
    expect(HERO_FEATURES.map((f) => f.title)).toEqual(['Easy to use', 'Accessibility report', 'Nothing leaves your computer', 'Multiple themes']);
    expect(HERO_FEATURES.map((f) => f.title)).not.toContain(KICKER);
    expect(section.querySelector('ul.hero-features')?.getAttribute('role')).toBe('list');
    for (const card of cards) {
      expect(card.hasAttribute('role')).toBe(false);
      expect(card.hasAttribute('tabindex')).toBe(false);
      expect(card.querySelector('a, button, input, [tabindex]')).toBeNull();
      const icon = card.querySelector('.hero-feature-icon')!;
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.querySelector('i.bi')).not.toBeNull();
      const sentence = text(card.querySelector('p'));
      expect(sentence).toMatch(/\.$/);
      expect(sentence.slice(0, -1)).not.toContain('. ');
    }
  });

  it('the cover card is aria-hidden, uses the inlined logo, and holds only placeholder text', () => {
    const host = render();
    const cover = host.querySelector('.hero-cover')!;
    expect(cover).not.toBeNull();
    expect(cover.getAttribute('aria-hidden')).toBe('true');
    expect(cover.closest('.wizard-band')).not.toBeNull();
    expect(text(cover.querySelector('.hero-cover-title'))).toBe('Course title');
    expect(text(cover.querySelector('.hero-cover-name'))).toBe('Instructor name');
    expect(text(cover)).toBe('Course titleInstructor name');
    expect(cover.querySelectorAll('.hero-cover-line').length).toBe(2);
    const img = cover.querySelector('img.hero-cover-logo')!;
    expect(img.getAttribute('src')).toBe(LOGO_DATA_URI);
    expect(img.getAttribute('alt')).toBe('');
    expect(cover.querySelector('a, button, input, [tabindex]')).toBeNull();
    expect(cover.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
    expect(cover.querySelector('.sg-display')).toBeNull();
  });

  it('contains no script and every control has a name', () => {
    const host = render({ error: 'x', busy: false });
    expect(host.querySelector('script')).toBeNull();
    for (const b of Array.from(host.querySelectorAll('button'))) {
      const name = text(b) || b.getAttribute('aria-label') || '';
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('UploadStep interactions', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  });

  function mount(props: Partial<Parameters<typeof UploadStep>[0]> = {}): void {
    root = createRoot(host);
    act(() => {
      root?.render(<UploadStep onFile={() => {}} busy={false} {...props} />);
    });
  }

  function drop(el: Element, file: File): void {
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { files: [file], dropEffect: 'copy' } });
    act(() => {
      el.dispatchEvent(ev);
    });
  }

  it('rejects a file that is not a course export with an alert, and accepts .imscc / .zip', () => {
    const onFile = vi.fn();
    mount({ onFile });
    const sheet = host.querySelector('.hero-drop')!;
    drop(sheet, new File(['nope'], 'notes.txt', { type: 'text/plain' }));
    expect(onFile).not.toHaveBeenCalled();
    expect(text(host.querySelector('[role="alert"]'))).toContain(WRONG_FILE_MESSAGE);

    const good = new File(['PK'], 'course-export.imscc');
    drop(sheet, good);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0]).toBe(good);
    expect(host.querySelector('[role="alert"]')).toBeNull();

    drop(sheet, new File(['PK'], 'course-export.ZIP'));
    expect(onFile).toHaveBeenCalledTimes(2);
  });

  it('ignores drops while busy and lets the user dismiss an app error', () => {
    const onFile = vi.fn();
    mount({ onFile, busy: true, error: 'Could not read that course export. HTTP 404' });
    drop(host.querySelector('.hero-drop')!, new File(['PK'], 'x.imscc'));
    expect(onFile).not.toHaveBeenCalled();
    const dismiss = host.querySelector<HTMLButtonElement>('[role="alert"] button[aria-label="Dismiss error"]')!;
    act(() => dismiss.click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('"Choose a file" and a tap on the blank paper open the picker', () => {
    mount();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    const choose = Array.from(host.querySelectorAll<HTMLButtonElement>('.hero-drop button')).find((b) => text(b) === 'Choose a file')!;
    act(() => choose.click());
    expect(click).toHaveBeenCalledTimes(1);
    // Pointer enhancement: the blank sheet opens the picker too.
    const sheet = host.querySelector<HTMLDivElement>('.hero-drop')!;
    act(() => sheet.click());
    expect(click).toHaveBeenCalledTimes(2);
  });
});
