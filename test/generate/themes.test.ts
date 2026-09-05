import { describe, it, expect } from 'vitest';
import { themeCss } from '../../src/lib/generate';
import { DEFAULT_PALETTE, INK, PALETTES, getPalette } from '../../src/lib/generate/colors';
import {
  BASE_CSS,
  MUTED_INK,
  ORIGINAL_CSS,
  PRINT_CSS_ORIGINAL,
  PRINT_CSS_STYLED,
  STYLED_FONT_STACK,
  gridColor,
  printCss,
  styledCss,
} from '../../src/lib/generate/themes';
import { PRESENTATIONS, contrast, parseVars } from './helpers';

/** The screen part of a styled stylesheet (everything before the print block). */
function screenPart(css: string): string {
  return css.slice(0, css.indexOf('/* ---- print ---- */'));
}

function noScriptOrRemote(css: string): void {
  expect(css.toLowerCase()).not.toContain('<script');
  expect(css.toLowerCase()).not.toContain('javascript:');
  expect(css).not.toMatch(/\son[a-z]+\s*=/i);
  expect(css).not.toContain('</style');
  expect(css).not.toContain('@import');
  expect(css).not.toContain('url(');
  expect(css).not.toContain('@font-face');
}

describe('themeCss composition', () => {
  it('original = base + original + print(original), and ignores the palette argument', () => {
    expect(themeCss('original')).toBe(`${BASE_CSS}\n${ORIGINAL_CSS}\n${PRINT_CSS_ORIGINAL}`);
    expect(themeCss('original', 'plum-blush')).toBe(themeCss('original'));
    expect(themeCss('original')).not.toContain('--sg-primary');
  });

  it('styled = base + styled(palette) + print(styled), defaulting to the default palette', () => {
    expect(themeCss('styled')).toBe(`${BASE_CSS}\n${styledCss(getPalette(DEFAULT_PALETTE))}\n${PRINT_CSS_STYLED}`);
    expect(themeCss('styled', DEFAULT_PALETTE)).toBe(themeCss('styled'));
    expect(themeCss('styled', 'jade-gold')).toBe(`${BASE_CSS}\n${styledCss(getPalette('jade-gold'))}\n${PRINT_CSS_STYLED}`);
    expect(themeCss('styled', 'jade-gold')).not.toBe(themeCss('styled'));
  });

  it('an unknown palette id falls back to the default rather than throwing', () => {
    expect(themeCss('styled', 'no-such-palette' as never)).toBe(themeCss('styled'));
  });

  it.each(PRESENTATIONS)('%s is deterministic and script-free', (p) => {
    const css = themeCss(p);
    expect(themeCss(p)).toBe(css);
    noScriptOrRemote(css);
  });

  it('original stays light and never styles body content fonts or colours', () => {
    expect(ORIGINAL_CSS).toContain('color-scheme: light;');
    expect(themeCss('original')).not.toContain('prefers-color-scheme');
    for (const css of [BASE_CSS, ORIGINAL_CSS]) {
      // body/html blocks carry no font-family and no text colour
      for (const m of css.matchAll(/(?:^|\n)(?:html|body)\s*\{([^}]*)\}/g)) {
        expect(m[1]).not.toMatch(/font-family/);
        expect(m[1]).not.toMatch(/(^|[^-])color\s*:/);
      }
      // no bare element selectors that would restyle content
      expect(css).not.toMatch(/(^|\n)(p|a|h[1-6]|ul|ol|li|table|th|td|blockquote|code|pre)(\s*,\s*[a-z0-9]+)*\s*\{/);
    }
  });
});

describe.each(PALETTES)('styled theme: $name ($id)', (p) => {
  const css = themeCss('styled', p.id);
  const screen = screenPart(css);
  const root = /:root\s*\{([^}]*)\}/.exec(screen)?.[1] ?? '';
  const vars = parseVars(root);

  it('declares the five roles, ink, muted ink and a gridline on :root, exactly once', () => {
    expect(screen.match(/:root\s*\{/g)?.length).toBe(1);
    expect(vars).toMatchObject({
      primary: p.primary,
      secondary: p.secondary,
      accent: p.accent,
      tint: p.tint,
      paper: p.paper,
      ink: INK,
      muted: MUTED_INK,
      grid: gridColor(p),
    });
    // the base frame's aliases point at the roles
    expect(vars.bg).toBe('var(--sg-paper)');
    expect(vars.fg).toBe('var(--sg-ink)');
    expect(vars.link).toBe('var(--sg-accent)');
    expect(vars.rule).toBe('var(--sg-grid)');
  });

  it('contains the palette hex values literally (primary, accent) and names the palette', () => {
    expect(css).toContain(p.primary);
    expect(css).toContain(p.accent);
    expect(css).toContain(`(${p.id})`);
  });

  it('stays a light document: no dark-mode block, color-scheme light, paper background', () => {
    expect(css).not.toContain('prefers-color-scheme');
    expect(root).toContain('color-scheme: light;');
    expect(screen).toMatch(/\nbody\s*\{[^}]*background:\s*var\(--sg-paper\)/);
    expect(screen).toMatch(/\nbody\s*\{[^}]*color:\s*var\(--sg-ink\)/);
  });

  it('sets the Inter stack on the body and inherits it for headings', () => {
    expect(screen).toMatch(new RegExp(`\\nbody\\s*\\{[^}]*font-family:\\s*${STYLED_FONT_STACK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(STYLED_FONT_STACK.startsWith('"Inter Variable", Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif')).toBe(true);
    expect(screen).toMatch(/h1, h2, h3, h4, h5, h6\s*\{[^}]*font-family:\s*inherit[^}]*font-weight:\s*700[^}]*line-height:\s*1\.2/);
  });

  it('cover: a primary band with paper text; logo on a paper plate at 3rem', () => {
    expect(screen).toMatch(/\.sg-cover\s*\{[^}]*background:\s*var\(--sg-primary\)[^}]*color:\s*var\(--sg-paper\)/);
    expect(screen).toMatch(/\.sg-cover \.sg-title[^{]*\{[^}]*color:\s*var\(--sg-paper\)/);
    expect(screen).toMatch(/\.sg-logo\s*\{[^}]*max-height:\s*3rem[^}]*background:\s*var\(--sg-paper\)/);
  });

  it('section h2 in primary over a 3px secondary rule; h3–h6 stepped in ink', () => {
    expect(screen).toMatch(/\.sg-section > h2\s*\{[^}]*color:\s*var\(--sg-primary\)[^}]*border-bottom:\s*3px solid var\(--sg-secondary\)/);
    expect(screen).toMatch(/\.sg-section h3 \{ font-size: 1\.35rem; \}/);
    expect(screen).toMatch(/\.sg-section h4 \{ font-size: 1\.15rem; \}/);
    expect(screen).toMatch(/\.sg-section h5 \{ font-size: 1rem; \}/);
    expect(screen).toMatch(/\.sg-section h6 \{ font-size: 0\.95rem; \}/);
    expect(screen).toMatch(/\.sg-section h3, \.sg-section h4, \.sg-section h5, \.sg-section h6\s*\{[^}]*color:\s*var\(--sg-ink\)/);
  });

  it('links in accent, underlined, with a 3px focus ring', () => {
    expect(screen).toMatch(/\na\s*\{[^}]*color:\s*var\(--sg-accent\)[^}]*text-decoration:\s*underline/);
    expect(screen).toMatch(/a:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--sg-accent\)/);
  });

  it('contents on the tint with a primary heading', () => {
    expect(screen).toMatch(/\.sg-toc\s*\{[^}]*background:\s*var\(--sg-tint\)/);
    expect(screen).toMatch(/\.sg-toc h2\s*\{[^}]*color:\s*var\(--sg-primary\)/);
  });

  it('tables: th on primary with paper text, zebra rows in tint, 1px gridlines from secondary', () => {
    expect(screen).toMatch(/\nth\s*\{[^}]*background:\s*var\(--sg-primary\)[^}]*color:\s*var\(--sg-paper\)/);
    expect(screen).toMatch(/tbody tr:nth-child\(even\) td\s*\{[^}]*background:\s*var\(--sg-tint\)/);
    expect(screen).toMatch(/\.sg-section table:not\(\[border="0"\]\) td\s*\{[^}]*border:\s*1px solid var\(--sg-grid\)/);
    const grid = gridColor(p);
    expect(contrast(grid, p.paper)).toBeGreaterThanOrEqual(3);
  });

  it('blockquote: secondary bar on a tint background; captions and metadata in muted ink, never secondary', () => {
    expect(screen).toMatch(/\nblockquote\s*\{[^}]*border-left:\s*4px solid var\(--sg-secondary\)[^}]*background:\s*var\(--sg-tint\)/);
    expect(screen).toMatch(/figcaption, \.sg-meta, [^{]*\{\s*color:\s*var\(--sg-muted\);\s*\}/);
    expect(screen).not.toMatch(/figcaption[^{]*\{[^}]*var\(--sg-secondary\)/);
  });

  it('kind labels: small caps in ink on tint', () => {
    expect(screen).toMatch(/\.sg-kind\s*\{[^}]*font-variant-caps:\s*all-small-caps[^}]*color:\s*var\(--sg-ink\)[^}]*background:\s*var\(--sg-tint\)/);
  });

  it('lays the frame out as a full-width band plus a 52rem column', () => {
    expect(screen).toMatch(/\nbody\s*\{[^}]*max-width:\s*none/);
    expect(screen).toMatch(/\.sg-cover-inner, \.sg-toc, #sg-main, \.sg-stamp\s*\{[^}]*max-width:\s*52rem/);
  });

  it('is deterministic and script-free', () => {
    expect(themeCss('styled', p.id)).toBe(css);
    noScriptOrRemote(css);
  });
});

describe('base frame rules', () => {
  it('has the page frame, skip link, caps, borders and marker styles', () => {
    expect(BASE_CSS).toMatch(/body\s*\{[^}]*max-width:\s*52rem/);
    expect(BASE_CSS).toMatch(/\.sg-skip\s*\{[^}]*clip-path:\s*inset\(50%\)/);
    expect(BASE_CSS).toMatch(/\.sg-skip:focus[^{]*\{[^}]*position:\s*fixed/);
    expect(BASE_CSS).toContain('.sg-center { text-align: center; }');
    expect(BASE_CSS).toContain('.sg-right { text-align: right; }');
    for (const cls of [
      '.sg-meta',
      '.sg-embed',
      '.sg-media',
      '.sg-missing-image',
      '.sg-equation',
      '.sg-stamp',
      '.sg-cover',
      '.sg-cover-min',
      '.sg-toc',
      '.sg-logo',
      '.sg-brand',
    ]) {
      expect(BASE_CSS).toContain(cls);
    }
    expect(BASE_CSS).toMatch(/\.sg-section img\s*\{[^}]*max-width:\s*100%/);
    expect(BASE_CSS).toMatch(/\.sg-logo\s*\{[^}]*max-height:\s*3rem/);
    expect(BASE_CSS).toMatch(/\.sg-section table\s*\{[^}]*max-width:\s*100%/);
    expect(BASE_CSS).toMatch(/th,\s*\n?\.sg-section table:not\(\[border="0"\]\) td\s*\{[^}]*border:\s*1px solid/);
    expect(BASE_CSS).toMatch(/\.sg-section figcaption/);
  });
});

describe('print rules', () => {
  // The shared frame block comes first; each presentation appends its own @media print block.
  const shared = PRINT_CSS_STYLED.slice(0, PRINT_CSS_STYLED.lastIndexOf('@media print'));

  it('both presentations share the same page frame rules', () => {
    expect(printCss('original')).toBe(PRINT_CSS_ORIGINAL);
    expect(printCss('styled')).toBe(PRINT_CSS_STYLED);
    expect(PRINT_CSS_ORIGINAL.startsWith(shared)).toBe(true);
    expect(PRINT_CSS_STYLED.startsWith(shared)).toBe(true);
    expect(shared).toContain('@page {\n  margin: 2cm;\n}');
  });

  it('breaks before sections only under .sg-breaks, and after the cover and toc but never after the slim masthead', () => {
    expect(shared).toMatch(/\.sg-breaks \.sg-section\s*\{[^}]*break-before:\s*page/);
    expect(shared).not.toMatch(/(^|\n)\s*\.sg-section\s*\{[^}]*break-before:\s*page/);
    expect(shared).toMatch(/\.sg-cover:not\(\.sg-cover-min\), \.sg-toc\s*\{[^}]*break-after:\s*page/);
    expect(shared).toMatch(/\.sg-breaks #sg-main > \.sg-section:first-child\s*\{[^}]*break-before:\s*auto/);
  });

  it('keeps headings with the next block and avoids splitting rows, figures and list items', () => {
    expect(shared).toMatch(/h1, h2, h3, h4, h5, h6\s*\{[^}]*break-after:\s*avoid/);
    expect(shared).toMatch(/tr, figure, li[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(shared).toMatch(/orphans:\s*3/);
    expect(shared).toMatch(/widows:\s*3/);
  });

  it('prints toc links as static text and hides the skip link', () => {
    expect(shared).toMatch(/\.sg-toc a\s*\{[^}]*color:\s*inherit !important[^}]*text-decoration:\s*none !important/);
    expect(shared).toMatch(/\.sg-skip\s*\{[^}]*display:\s*none !important/);
  });

  it('original collapses every fill and colour to black on white and keeps borders', () => {
    const block = PRINT_CSS_ORIGINAL.slice(PRINT_CSS_ORIGINAL.indexOf('/* original:'));
    expect(block).toMatch(/\*\s*\{[^}]*background:\s*transparent !important[^}]*color:\s*#000000 !important/);
    expect(block).toMatch(/th, td\s*\{[^}]*border-color:\s*#000000 !important/);
  });

  it('styled keeps primary on headings, collapses surfaces to white, and prints light-grey table headers in ink', () => {
    const block = PRINT_CSS_STYLED.slice(PRINT_CSS_STYLED.indexOf('/* styled:'));
    expect(block).toMatch(/\.sg-cover \.sg-title, \.sg-section > h2, \.sg-toc h2\s*\{[^}]*color:\s*var\(--sg-primary\) !important/);
    expect(block).toMatch(/html, body, \.sg-cover, \.sg-toc, blockquote, code, pre[^{]*\{[^}]*background:\s*#ffffff !important/);
    expect(block).toMatch(/\n\s*th\s*\{[^}]*background:\s*#e7e5e4 !important[^}]*color:\s*#1c1917 !important/);
    expect(block).not.toMatch(/\*\s*\{[^}]*color:\s*#000000/);
    // the print header fill and gridline pass on white
    expect(contrast('#1c1917', '#e7e5e4')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#78716c', '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});
