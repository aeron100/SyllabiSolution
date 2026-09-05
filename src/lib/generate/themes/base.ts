/**
 * Base stylesheet shared by every presentation: the page frame (cover, TOC,
 * section spacing, skip link), max-width caps so nothing clips, table
 * borders, and the markers the processing pass emits (.sg-meta, .sg-embed,
 * .sg-media, .sg-missing-image, .sg-equation, .sg-center, .sg-right).
 *
 * It never sets a font-family or a text colour on body content, so the
 * Original presentation (base + a light lock) leaves the instructor's
 * formatting untouched. Colours are read from --sg-* variables with plain
 * fallbacks so the same rules serve the Styled presentation.
 */
export const BASE_CSS = `/* ---- base: frame shared by every presentation ---- */
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
body {
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  max-width: 52rem;
  box-sizing: border-box;
  overflow-wrap: break-word;
}
.sg-cover, .sg-toc, .sg-section, .sg-stamp {
  box-sizing: border-box;
}

/* skip link: visually hidden until it receives focus */
.sg-skip {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
.sg-skip:focus, .sg-skip:focus-visible {
  position: fixed;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 10;
  width: auto;
  height: auto;
  margin: 0;
  padding: 0.5rem 0.75rem;
  clip: auto;
  clip-path: none;
  white-space: normal;
  background: var(--sg-bg, #ffffff);
  color: var(--sg-fg, #000000);
  outline: 3px solid var(--sg-link, #000000);
  outline-offset: 2px;
  text-decoration: underline;
}

/* cover (.sg-cover-min is the slim masthead used when the cover page is off) */
.sg-cover {
  padding: 2.5rem 0 1.5rem;
  margin: 0 0 2rem;
  border-bottom: 1px solid var(--sg-rule, #999999);
}
.sg-cover-min {
  padding: 1.5rem 0 1rem;
}
.sg-title {
  font-size: 2.25rem;
  line-height: 1.2;
  margin: 0 0 0.5rem;
}
.sg-cover-min .sg-title {
  margin: 0;
}
.sg-code {
  font-size: 1.125rem;
  margin: 0;
}
.sg-term {
  margin: 0.25rem 0 0;
}
.sg-instructor {
  margin: 0.75rem 0 0;
  font-size: 1.25rem;
  font-weight: 600;
}
.sg-brand {
  margin: 0 0 1.25rem;
}
.sg-institution {
  margin: 0;
}
.sg-logo {
  display: block;
  max-height: 3rem;
  width: auto;
  max-width: 100%;
}
.sg-cover dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.35rem 1.25rem;
  margin: 1.5rem 0 0;
}
.sg-cover dt {
  font-weight: 700;
}
.sg-cover dd {
  margin: 0;
}
@media (max-width: 30em) {
  .sg-cover dl { grid-template-columns: 1fr; gap: 0; }
  .sg-cover dd { margin: 0 0 0.5rem; }
}

/* table of contents */
.sg-toc {
  margin: 0 0 2.5rem;
}
.sg-toc h2 {
  font-size: 1.25rem;
  margin: 0 0 0.5rem;
}
.sg-toc ol {
  margin: 0;
  padding-left: 1.5rem;
}
.sg-toc li {
  margin: 0.3rem 0;
}

/* sections */
.sg-section {
  margin: 0 0 2.5rem;
}
.sg-section + .sg-section {
  padding-top: 1.5rem;
  border-top: 1px solid var(--sg-rule, #999999);
}
.sg-section > h2 {
  margin-top: 0;
}

/* caps so nothing clips on screen or in print */
.sg-section img {
  max-width: 100%;
  height: auto;
}
.sg-section table {
  max-width: 100%;
  border-collapse: collapse;
}
.sg-section table:not([border="0"]) th,
.sg-section table:not([border="0"]) td {
  border: 1px solid var(--sg-rule, #999999);
}
.sg-section th, .sg-section td {
  padding: 0.35rem 0.5rem;
  vertical-align: top;
}
.sg-section pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.sg-section figure {
  margin: 1rem 0;
}
.sg-section figcaption {
  font-size: 0.9em;
  margin-top: 0.35rem;
}

/* alignment classes the styled variant emits in place of inline styles */
.sg-center { text-align: center; }
.sg-right { text-align: right; }

/* markers emitted by the processing pass */
.sg-meta {
  font-size: 0.95em;
  margin: 0 0 1rem;
}
.sg-meta dt { font-weight: 700; }
.sg-meta dd { margin: 0 0 0.25rem; }
.sg-embed, .sg-media {
  margin: 1rem 0;
  padding: 0.5rem 0.75rem;
  border: 1px dashed var(--sg-rule, #999999);
  font-style: italic;
}
.sg-missing-image {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border: 1px dashed var(--sg-rule, #999999);
  font-style: italic;
}
.sg-equation {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.95em;
  white-space: pre-wrap;
}

/* generated-on stamp (opt-in) */
.sg-stamp {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--sg-rule, #999999);
  font-size: 0.85em;
}
.sg-stamp p { margin: 0; }
`;
