/**
 * Styled presentation (DESIGN.md §8): one clean layout in a named five-role
 * palette. Applies to the neutral variant only (styles already stripped).
 *
 * The document is a document: it stays light on screen even when the viewer
 * prefers dark mode (only the app around it goes dark), and every colour is
 * a plain hex so contrast is measurable. Fonts are not embedded; the family
 * stack starts with the app's own Inter and falls back to system sans.
 *
 * Role use, per §8:
 *   primary    cover band, section h2, table headers, TOC heading
 *   secondary  the 3px rule under h2, blockquote bar, hr, gridlines (softened)
 *   accent     links and focus rings
 *   tint       TOC panel, zebra rows, blockquote and code backgrounds
 *   paper      page background, text on primary
 *   ink        body text and h3–h6; muted ink for captions and metadata
 */
import type { Palette } from '../../types';
import { INK } from '../colors';
import { contrastRatio, mixHex } from '../contrast';

/** Captions, metadata, notes. Tailwind stone-700: ≥ 4.5:1 on every paper and tint. */
export const MUTED_INK = '#44403c';

/** Font stack for body and headings. Nothing is embedded; the first family is the app's own. */
export const STYLED_FONT_STACK = '"Inter Variable", Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Gridline colour, derived from the palette's secondary: the lightest mix
 * toward paper that still reaches 3:1 against both paper and the tint (zebra
 * rows), so a 1px table border stays a measurable boundary. A secondary that
 * only just passes on paper (the contract minimum) is nudged toward ink
 * instead. Deterministic: the candidate list is fixed.
 */
export function gridColor(p: Palette): string {
  const passes = (c: string) => contrastRatio(c, p.paper) >= 3 && contrastRatio(c, p.tint) >= 3;
  for (const share of [0.45, 0.3, 0.15]) {
    const c = mixHex(p.secondary, p.paper, share);
    if (passes(c)) return c;
  }
  if (passes(p.secondary)) return p.secondary;
  for (const share of [0.15, 0.3, 0.45]) {
    const c = mixHex(p.secondary, INK, share);
    if (passes(c)) return c;
  }
  return mixHex(p.secondary, INK, 0.6);
}

/** Custom properties for one palette, in a fixed order so output is stable. */
export function paletteVars(p: Palette): string {
  return [
    `  --sg-primary: ${p.primary};`,
    `  --sg-secondary: ${p.secondary};`,
    `  --sg-accent: ${p.accent};`,
    `  --sg-tint: ${p.tint};`,
    `  --sg-paper: ${p.paper};`,
    `  --sg-ink: ${INK};`,
    `  --sg-muted: ${MUTED_INK};`,
    `  --sg-grid: ${gridColor(p)};`,
    // aliases the shared base frame reads
    '  --sg-bg: var(--sg-paper);',
    '  --sg-fg: var(--sg-ink);',
    '  --sg-link: var(--sg-accent);',
    '  --sg-rule: var(--sg-grid);',
  ].join('\n');
}

export function styledCss(p: Palette): string {
  return `/* ---- styled: ${p.name} (${p.id}) ---- */
:root {
  color-scheme: light;
${paletteVars(p)}
}
html {
  background: var(--sg-paper);
}
body {
  background: var(--sg-paper);
  color: var(--sg-ink);
  font-family: ${STYLED_FONT_STACK};
  font-size: 1rem;
  line-height: 1.6;
  max-width: none;
  margin: 0;
  padding: 0 0 4rem;
}

/* the column: the cover band spans the page; everything else sits in a 52rem column */
.sg-cover-inner, .sg-toc, #sg-main, .sg-stamp {
  max-width: 52rem;
  margin-left: auto;
  margin-right: auto;
  padding-left: 1.25rem;
  padding-right: 1.25rem;
  box-sizing: border-box;
}

h1, h2, h3, h4, h5, h6 {
  font-family: inherit;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: var(--sg-ink);
  margin: 1.6em 0 0.5em;
}
p { margin: 0 0 1.1em; }
ul, ol { margin: 0 0 1.1em; padding-left: 1.5em; }
li { margin: 0.3em 0; }
a {
  color: var(--sg-accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.15em;
}
a:hover { text-decoration-thickness: 2px; }
a:focus-visible {
  outline: 3px solid var(--sg-accent);
  outline-offset: 2px;
  border-radius: 2px;
}
.sg-skip:focus, .sg-skip:focus-visible {
  background: var(--sg-paper);
  color: var(--sg-ink);
  outline-color: var(--sg-accent);
}
blockquote {
  margin: 1.25em 0;
  padding: 0.75em 1em;
  border-left: 4px solid var(--sg-secondary);
  background: var(--sg-tint);
}
blockquote > :last-child { margin-bottom: 0; }
hr {
  border: 0;
  border-top: 1px solid var(--sg-secondary);
  margin: 2.5em 0;
}
table {
  margin: 1.25em 0;
  font-size: 0.95em;
}
th {
  text-align: left;
  font-weight: 600;
  background: var(--sg-primary);
  color: var(--sg-paper);
}
th a {
  color: inherit;
}
tbody tr:nth-child(even) td {
  background: var(--sg-tint);
}
.sg-section table:not([border="0"]) th,
.sg-section table:not([border="0"]) td {
  border: 1px solid var(--sg-grid);
}
.sg-section th, .sg-section td {
  padding: 0.5rem 0.75rem;
}
caption {
  text-align: left;
  font-weight: 600;
  color: var(--sg-muted);
  padding: 0 0 0.35rem;
}
code, kbd, samp {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
  background: var(--sg-tint);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
pre {
  background: var(--sg-tint);
  padding: 1em 1.25em;
  border-left: 3px solid var(--sg-secondary);
  font-size: 0.9em;
}
pre code { background: none; padding: 0; font-size: 1em; }
figcaption, .sg-meta, .sg-stamp, .sg-embed, .sg-media, .sg-missing-image {
  color: var(--sg-muted);
}
.sg-embed, .sg-media, .sg-missing-image {
  border-color: var(--sg-grid);
  border-radius: 4px;
}
/* kind labels: small caps in ink on tint (hook for a per-section kind tag) */
.sg-kind {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 600;
  font-variant-caps: all-small-caps;
  letter-spacing: 0.06em;
  color: var(--sg-ink);
  background: var(--sg-tint);
  padding: 0.1em 0.55em;
  border-radius: 3px;
}

/* cover: a full-width band in primary with paper text */
.sg-cover {
  background: var(--sg-primary);
  color: var(--sg-paper);
  padding: 3rem 0 2.5rem;
  margin: 0 0 2.5rem;
  border-bottom: 0;
}
.sg-cover-min {
  padding: 1.5rem 0 1.25rem;
}
.sg-cover .sg-title, .sg-cover .sg-code, .sg-cover .sg-term, .sg-cover .sg-instructor, .sg-cover dt, .sg-cover dd, .sg-cover a {
  color: var(--sg-paper);
}
.sg-cover a:focus-visible {
  outline-color: var(--sg-paper);
}
.sg-cover .sg-title {
  font-size: 2.5rem;
  letter-spacing: -0.02em;
  margin: 0 0 0.5rem;
}
.sg-cover-min .sg-title {
  font-size: 1.75rem;
  margin: 0;
}
.sg-code {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.sg-term {
  font-size: 1.05rem;
}
.sg-instructor {
  margin: 1rem 0 0;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.sg-cover dl {
  margin-top: 1.75rem;
  gap: 0.4rem 1.5rem;
}
.sg-cover dt {
  font-weight: 600;
}
.sg-brand {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin: 0 0 1.75rem;
}
.sg-institution {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
/* the logo sits on a paper plate so a dark mark stays visible on the band */
.sg-logo {
  display: block;
  box-sizing: content-box;
  max-height: 3rem;
  width: auto;
  max-width: 100%;
  background: var(--sg-paper);
  padding: 0.375rem 0.625rem;
  border-radius: 4px;
}

/* contents: a tinted panel with the heading in primary */
.sg-toc {
  background: var(--sg-tint);
  width: calc(100% - 2.5rem);
  padding: 1.25rem 1.5rem;
  margin: 0 auto 3rem;
  border-radius: 4px;
}
.sg-toc h2 {
  color: var(--sg-primary);
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 0.75rem;
}
.sg-toc ol {
  padding-left: 1.75em;
}
.sg-toc li {
  margin: 0.4rem 0;
}
.sg-toc a { font-weight: 500; }

/* sections: h2 in primary over a 3px secondary rule; h3–h6 stepped, in ink */
.sg-section {
  margin: 0 0 3rem;
}
.sg-section + .sg-section {
  border-top: 0;
  padding-top: 0;
}
.sg-section > h2 {
  font-size: 1.75rem;
  color: var(--sg-primary);
  padding-bottom: 0.35rem;
  border-bottom: 3px solid var(--sg-secondary);
  margin: 0 0 1.25rem;
}
.sg-section h3 { font-size: 1.35rem; }
.sg-section h4 { font-size: 1.15rem; }
.sg-section h5 { font-size: 1rem; }
.sg-section h6 { font-size: 0.95rem; }
.sg-section h3, .sg-section h4, .sg-section h5, .sg-section h6 {
  color: var(--sg-ink);
}
.sg-stamp {
  border-top: 1px solid var(--sg-grid);
}
`;
}
