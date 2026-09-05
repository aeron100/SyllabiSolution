/**
 * Print stylesheet, appended to every presentation (DESIGN.md §7, §8).
 *
 * Shared by both presentations:
 * - @page margins (2cm)
 * - page break after the cover and the contents list (never after the slim
 *   masthead used when the cover is off)
 * - page break before each section only when the body carries .sg-breaks
 * - headings keep with next; rows, figures and list items do not split
 * - orphans/widows 3
 * - contents links print as static text
 * - skip link hidden
 *
 * Original: every fill collapses to transparent and every colour to black,
 * because the inline colours are the instructor's and may be heavy.
 *
 * Styled: headings keep the palette's primary (it passes on white); tint and
 * surfaces collapse to white; the table header fill becomes a light grey with
 * ink text so navy blocks are not burned into every page; links keep accent.
 */
import type { Presentation } from '../../types';
import { INK } from '../colors';

/** Table header fill in print (Tailwind stone-200) and gridlines (stone-500). */
const PRINT_TH_FILL = '#e7e5e4';
const PRINT_GRID = '#78716c';

const SHARED = `/* ---- print ---- */
@page {
  margin: 2cm;
}
@media print {
  body {
    max-width: none;
    margin: 0;
    padding: 0;
    orphans: 3;
    widows: 3;
  }
  * {
    box-shadow: none !important;
    text-shadow: none !important;
  }
  .sg-skip {
    display: none !important;
  }
  .sg-cover:not(.sg-cover-min), .sg-toc {
    break-after: page;
    page-break-after: always;
  }
  .sg-breaks .sg-section {
    break-before: page;
    page-break-before: always;
  }
  .sg-breaks #sg-main > .sg-section:first-child {
    break-before: auto;
    page-break-before: auto;
  }
  .sg-breaks .sg-section + .sg-section {
    border-top: 0;
    padding-top: 0;
  }
  h1, h2, h3, h4, h5, h6 {
    break-after: avoid;
    page-break-after: avoid;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  tr, figure, li, img, pre, blockquote {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  thead {
    display: table-header-group;
  }
  p, li, blockquote, dd {
    orphans: 3;
    widows: 3;
  }
  .sg-toc a {
    color: inherit !important;
    text-decoration: none !important;
  }
  .sg-toc {
    columns: 1;
  }
  .sg-section a {
    text-decoration: underline;
  }
  img {
    max-width: 100% !important;
  }
}
`;

const ORIGINAL_PRINT = `@media print {
  /* original: collapse every fill and colour to black on white */
  * {
    background: transparent !important;
    color: #000000 !important;
  }
  th, td {
    border-color: #000000 !important;
  }
  .sg-cover, .sg-section + .sg-section, .sg-stamp, .sg-toc {
    border-color: #000000 !important;
  }
}
`;

const STYLED_PRINT = `@media print {
  /* styled: surfaces to white, primary kept on headings, light table headers */
  html, body, .sg-cover, .sg-toc, blockquote, code, pre, .sg-logo,
  tbody tr:nth-child(even) td, .sg-kind {
    background: #ffffff !important;
  }
  body, .sg-cover .sg-code, .sg-cover .sg-term, .sg-cover dt, .sg-cover dd, .sg-cover a, .sg-institution {
    color: ${INK} !important;
  }
  .sg-cover {
    padding-top: 0 !important;
    padding-bottom: 1rem !important;
    border-bottom: 3px solid var(--sg-secondary) !important;
  }
  .sg-cover .sg-title, .sg-section > h2, .sg-toc h2 {
    color: var(--sg-primary) !important;
  }
  .sg-logo {
    padding: 0 !important;
  }
  th {
    background: ${PRINT_TH_FILL} !important;
    color: ${INK} !important;
  }
  th, td {
    border-color: ${PRINT_GRID} !important;
  }
  .sg-stamp, .sg-embed, .sg-media, .sg-missing-image {
    border-color: ${PRINT_GRID} !important;
  }
}
`;

/** Print rules for a presentation: the shared block plus that presentation's colour handling. */
export function printCss(presentation: Presentation): string {
  return presentation === 'original' ? `${SHARED}${ORIGINAL_PRINT}` : `${SHARED}${STYLED_PRINT}`;
}

export const PRINT_CSS_ORIGINAL = printCss('original');
export const PRINT_CSS_STYLED = printCss('styled');
