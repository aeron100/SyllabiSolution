/**
 * Assemble a SyllabusDoc into one self-contained HTML document
 * (DESIGN.md §7). Pure and deterministic: no timestamps, no randomness.
 * The only time-dependent text is options.stamp, supplied by the caller.
 *
 * Structure:
 *   <!doctype html><html lang><head> charset, viewport, title, <style>
 *   <body class="sg sg-<presentation> [sg-breaks]" [data-palette]>
 *     skip link
 *     <header class="sg-cover">              when showCover: institution/logo,
 *                                            h1, code, term, contact list
 *     <header class="sg-cover sg-cover-min"> when the cover is off: just the h1,
 *                                            so the h1 always precedes the nav
 *     <nav class="sg-toc">                   when showToc and there are sections
 *     <main id="sg-main">
 *       <section id class aria-labelledby><h2>title</h2> body</section> × N
 *       (a section whose title repeats an earlier one is named with
 *        aria-label="<contents-list label>" instead, so every region
 *        landmark has a unique name — axe landmark-unique)
 *     </main>
 *     <footer class="sg-stamp">              when options.stamp is set
 *
 * No <script> anywhere. Section bodies pass through the final guard.
 */
import {
  KIND_LABEL,
  type AssembledDoc,
  type CoverInfo,
  type Kind,
  type NoticeCode,
  type Presentation,
  type ProcessedPage,
  type ReportEntry,
  type SyllabusDoc,
} from '../types';
import { getPalette } from './colors';
import { guardHtml } from './guard';
import { clean, escapeHtml as esc, isLanguageTag, looksLikeEmail, utf8Length } from './text';
import { themeCss } from './themes';

/** Canonical order for notices so the union is stable regardless of section order. */
const NOTICE_ORDER: readonly NoticeCode[] = [
  'equations',
  'media-omitted',
  'external-images',
  'interactive-removed',
  'low-contrast',
  'missing-files',
];

/** Ids the frame reserves; section ids must not collide with them. */
const RESERVED_IDS = ['sg-main', 'sg-toc-h'];

/**
 * A cover logo must be an embedded image (the file is self-contained and
 * never loads anything remote): a data: URI with an image media type, a
 * base64 payload, and nothing that could break out of the attribute.
 */
const IMAGE_DATA_URI = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=.-]+)*;base64,[A-Za-z0-9+/]+=*$/;

interface SectionPlan {
  id: string;
  headingId: string;
  title: string;
  tocLabel: string;
  kind: Kind;
  html: string;
  page: ProcessedPage;
}

function nextFree(base: string, taken: Set<string>, join: (b: string, n: number) => string): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(join(base, n))) n++;
  return join(base, n);
}

/**
 * Decide ids, titles and contents-list labels for every section.
 * - ids are kept as given (whitespace → "-"); a collision gets "-2", "-3"…
 * - duplicate titles keep their heading but get " (2)", " (3)"… in the TOC
 *   and as the section's landmark name (DESIGN.md §15 asks for the module
 *   name; ProcessedPage carries none yet, so the number is the fallback)
 */
function planSections(pages: readonly ProcessedPage[], presentation: Presentation): SectionPlan[] {
  const takenIds = new Set<string>(RESERVED_IDS);
  const takenLabels = new Set<string>();
  const plans: SectionPlan[] = [];

  for (const page of pages) {
    const rawId = clean(page.sectionId).replace(/\s+/g, '-') || `sec-${plans.length + 1}`;
    const id = nextFree(rawId, takenIds, (b, n) => `${b}-${n}`);
    const headingId = `${id}-title`;
    takenIds.add(id);
    takenIds.add(headingId);

    const title = clean(page.title) || KIND_LABEL[page.kind] || 'Untitled';
    // Labels are compared case-insensitively so "Week 1" and "week 1" disambiguate.
    const tocLabel = pickLabel(title, takenLabels);
    takenLabels.add(tocLabel.toLowerCase());

    const variant = presentation === 'original' ? page.original : page.neutral;
    plans.push({
      id,
      headingId,
      title,
      tocLabel,
      kind: page.kind,
      html: guardHtml(variant ?? ''),
      page,
    });
  }
  return plans;
}

/** Case-insensitive label disambiguation: first free of title, title (2), title (3)… */
function pickLabel(title: string, lowerTaken: Set<string>): string {
  if (!lowerTaken.has(title.toLowerCase())) return title;
  let n = 2;
  while (lowerTaken.has(`${title} (${n})`.toLowerCase())) n++;
  return `${title} (${n})`;
}

/** Trim, keep line breaks as <br>, escape everything else. */
function multiline(s: string): string {
  return s
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter((line) => line.length > 0)
    .map((line) => esc(line))
    .join('<br>');
}

/**
 * Institution line and logo, or "" when neither is provided. With a logo,
 * the institution name is the image's alt text and is not repeated beside
 * it (axe image-redundant-alt); without one it is a plain text line.
 */
function renderBrand(cover: CoverInfo): string {
  const institution = clean(cover.institution);
  const logo = (cover.logoDataUri ?? '').trim();
  if (IMAGE_DATA_URI.test(logo)) {
    return `<p class="sg-brand"><img class="sg-logo" src="${esc(logo)}" alt="${esc(institution)}"></p>`;
  }
  if (institution) return `<p class="sg-brand"><span class="sg-institution">${esc(institution)}</span></p>`;
  return '';
}

function renderCover(cover: CoverInfo, title: string): string {
  const out: string[] = ['<header class="sg-cover">', '<div class="sg-cover-inner">'];
  const brand = renderBrand(cover);
  if (brand) out.push(brand);
  out.push(`<h1 class="sg-title">${esc(title)}</h1>`);
  const code = clean(cover.courseCode);
  if (code) out.push(`<p class="sg-code">${esc(code)}</p>`);
  const term = clean(cover.term);
  if (term) out.push(`<p class="sg-term">${esc(term)}</p>`);
  // The instructor's name sits in the band with the course title (DESIGN.md §7).
  const instructor = (cover.instructor ?? '').trim();
  if (instructor) out.push(`<p class="sg-instructor">${multiline(instructor)}</p>`);

  const rows: string[] = [];
  const email = clean(cover.email);
  if (email) {
    const shown = looksLikeEmail(email) ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : esc(email);
    rows.push(`<dt>Email</dt><dd>${shown}</dd>`);
  }
  const office = (cover.officeHours ?? '').trim();
  if (office) rows.push(`<dt>Office hours</dt><dd>${multiline(office)}</dd>`);
  const meeting = (cover.meetingTimes ?? '').trim();
  if (meeting) rows.push(`<dt>Meeting times</dt><dd>${multiline(meeting)}</dd>`);
  if (rows.length) out.push('<dl class="sg-contact">', ...rows, '</dl>');

  out.push('</div>', '</header>');
  return out.join('\n');
}

/** The slim masthead used when the cover page is off: the h1 alone, still ahead of the nav. */
function renderMasthead(title: string): string {
  return [
    '<header class="sg-cover sg-cover-min">',
    '<div class="sg-cover-inner">',
    `<h1 class="sg-title">${esc(title)}</h1>`,
    '</div>',
    '</header>',
  ].join('\n');
}

function renderToc(sections: readonly SectionPlan[]): string {
  const items = sections.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.tocLabel)}</a></li>`);
  return [
    '<nav class="sg-toc" aria-labelledby="sg-toc-h">',
    '<h2 id="sg-toc-h">Contents</h2>',
    '<ol>',
    ...items,
    '</ol>',
    '</nav>',
  ].join('\n');
}

/**
 * A section is a region landmark named by its heading. When the heading
 * text repeats an earlier section's (two "Week 1" pages), the landmark takes
 * the disambiguated contents-list label as its name instead, so screen
 * readers list "Week 1" and "Week 1 (2)", the same words the contents list
 * shows. The visible heading always keeps the instructor's own title.
 */
function renderSection(s: SectionPlan): string {
  const name = s.tocLabel === s.title ? `aria-labelledby="${esc(s.headingId)}"` : `aria-label="${esc(s.tocLabel)}"`;
  const open = `<section id="${esc(s.id)}" class="sg-section sg-kind-${esc(s.kind)}" ${name}>`;
  const heading = `<h2 id="${esc(s.headingId)}">${esc(s.title)}</h2>`;
  return s.html ? [open, heading, s.html, '</section>'].join('\n') : [open, heading, '</section>'].join('\n');
}

function languageOf(language: string | undefined): string {
  const tag = clean(language);
  return isLanguageTag(tag) ? tag : 'en';
}

function aggregateReport(plans: readonly SectionPlan[]): AssembledDoc['report'] {
  const report: AssembledDoc['report'] = { fixed: [], todo: [], info: [] };
  for (const plan of plans) {
    for (const e of plan.page.report ?? []) {
      const entry: ReportEntry = {
        ...e,
        sectionId: e.sectionId ?? plan.id,
        sectionTitle: e.sectionTitle ?? plan.title,
      };
      if (e.severity === 'fixed') report.fixed.push(entry);
      else if (e.severity === 'todo') report.todo.push(entry);
      else report.info.push(entry);
    }
  }
  return report;
}

function unionNotices(pages: readonly ProcessedPage[]): NoticeCode[] {
  const seen = new Set<NoticeCode>();
  const extra: NoticeCode[] = [];
  for (const page of pages) {
    for (const n of page.notices ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (!NOTICE_ORDER.includes(n)) extra.push(n);
    }
  }
  return [...NOTICE_ORDER.filter((n) => seen.has(n)), ...extra];
}

export function assembleDocument(doc: SyllabusDoc): AssembledDoc {
  const { options, cover } = doc;
  const presentation: Presentation = options.presentation === 'original' ? 'original' : 'styled';
  const lang = languageOf(options.language);
  const courseTitle = clean(cover.courseTitle);
  const heading = courseTitle || 'Syllabus';
  const docTitle = courseTitle ? `${courseTitle} – Syllabus` : 'Syllabus';
  const stamp = (options.stamp ?? '').trim();
  const plans = planSections(doc.sections ?? [], presentation);

  // Styled resolves its palette (unknown ids fall back to the default) and
  // records the resolved id on the body; Original has no palette.
  const palette = presentation === 'styled' ? getPalette(options.palette) : undefined;

  const bodyClass = ['sg', `sg-${presentation}`, options.pageBreaks ? 'sg-breaks' : '']
    .filter((c) => c.length > 0)
    .join(' ');
  const bodyAttrs = palette ? ` class="${bodyClass}" data-palette="${esc(palette.id)}"` : ` class="${bodyClass}"`;

  const parts: string[] = [
    '<!doctype html>',
    `<html lang="${esc(lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(docTitle)}</title>`,
    '<style>',
    themeCss(presentation, palette?.id),
    '</style>',
    '</head>',
    `<body${bodyAttrs}>`,
    '<a class="sg-skip" href="#sg-main">Skip to content</a>',
  ];

  parts.push(options.showCover ? renderCover(cover, heading) : renderMasthead(heading));
  if (options.showToc && plans.length > 0) parts.push(renderToc(plans));

  parts.push('<main id="sg-main">');
  for (const plan of plans) parts.push(renderSection(plan));
  parts.push('</main>');

  if (stamp) parts.push(`<footer class="sg-stamp"><p>${esc(stamp)}</p></footer>`);

  parts.push('</body>', '</html>', '');
  const html = parts.join('\n');

  return {
    html,
    bytes: utf8Length(html),
    report: aggregateReport(plans),
    notices: unionNotices(doc.sections ?? []),
  };
}
