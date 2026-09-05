/**
 * Builds the srcdoc for the sandboxed preview iframe: theme CSS plus one
 * section in a minimal shell that mirrors the generated document's
 * structure (src/lib/generate/assemble.ts):
 *
 *   <body class="sg sg-<presentation>"><main id="sg-main">
 *     <section id class="sg-section sg-kind-<kind>" aria-labelledby><h2>…
 *
 * so the theme's selectors apply exactly as they will in the final file.
 * No script, ever.
 */
import type { Kind, Presentation } from '../lib/types';
import { escapeHtml } from './format';

export interface PreviewShellOptions {
  title: string;
  sectionId: string;
  kind: Kind;
  presentation: Presentation;
  html: string;
  css: string;
  language: string;
}

export function buildPreviewSrcdoc(o: PreviewShellOptions): string {
  // Same heading id the assembler uses, so theme selectors and anchors match.
  const headingId = `${o.sectionId}-title`;
  return (
    '<!doctype html>' +
    `<html lang="${escapeHtml(o.language)}">` +
    '<head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(o.title)}</title>` +
    `<style>${o.css}</style>` +
    '</head>' +
    `<body class="sg sg-${escapeHtml(o.presentation)} sg-preview">` +
    '<main id="sg-main">' +
    `<section id="${escapeHtml(o.sectionId)}" class="sg-section sg-kind-${escapeHtml(o.kind)}" aria-labelledby="${escapeHtml(headingId)}">` +
    `<h2 id="${escapeHtml(headingId)}">${escapeHtml(o.title)}</h2>` +
    o.html +
    '</section></main></body></html>'
  );
}
