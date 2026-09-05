/**
 * Step 5d: structural accessibility pass (DESIGN.md §6d). Runs once, before
 * the presentation switch, so both variants share one outline.
 */
import type { ProcessOptions } from '../types';
import {
  blockify, cleanText, elements, hasSignificantContent, INLINE_FORMAT_TAGS, isBlank, isElement, isEmptyBlock,
  isEntirelyBold, isLanguageTag, isText, pxOf, rename, reverseElements, stripLeadingChars, styleOf, textOf, unwrap,
} from './dom';
import { assignHeadingIds, normalizeHeadings, promoteFakeHeadings } from './headings';
import { imageDimensions } from './assets';
import type { Reporter } from './report';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

export function fixStructure(root: Element, opts: ProcessOptions, rep: Reporter): void {
  unwrapLandmarks(root);
  removeEmptyInline(root);
  removeEmptyBlocks(root, rep);
  unwrapLayoutTables(root, rep);
  promoteTableHeaders(root, rep);
  fixTableHeaders(root, opts.sectionId, rep);
  fixLists(root, rep);
  convertFakeLists(root, rep);
  // Images before headings: a heading left with nothing but a decorative
  // image is demoted here, before levels and anchors are assigned.
  fixImages(root, rep);
  demoteEmptyHeadings(root, rep);
  promoteFakeHeadings(root, rep);
  normalizeHeadings(root, opts.sectionTitle, rep);
  const idMap = assignHeadingIds(root, opts.sectionId);
  fixLinks(root, idMap, rep);
  fixLang(root, rep);
  removeEmptyInline(root);
  removeEmptyBlocks(root, rep);
}

// ---------------------------------------------------------------------------
// Landmarks inside a page are wrong in the assembled document
// ---------------------------------------------------------------------------

function unwrapLandmarks(root: Element): void {
  for (const el of reverseElements(root, 'summary')) {
    const p = rename(el, 'p');
    const strong = p.ownerDocument.createElement('strong');
    while (p.firstChild) strong.appendChild(p.firstChild);
    p.appendChild(strong);
  }
  for (const el of reverseElements(root, 'section, article, aside, header, footer, nav, main, details')) unwrap(el);
}

// ---------------------------------------------------------------------------
// Empties
// ---------------------------------------------------------------------------

function removeEmptyInline(root: Element): void {
  for (const el of reverseElements(root, Array.from(INLINE_FORMAT_TAGS).join(', '))) {
    if (el.children.length) continue;
    const text = el.textContent ?? '';
    if (text === '') el.remove();
    else if (isBlank(text)) el.replaceWith(el.ownerDocument.createTextNode(text));
  }
}

function removeEmptyBlocks(root: Element, rep: Reporter): void {
  let paragraphs = 0;
  for (const el of reverseElements(root, 'p, h1, h2, h3, h4, h5, h6, li, div, blockquote, figure, figcaption, dd, dt, pre')) {
    if (el.classList.contains('sg-embed') || el.classList.contains('sg-media')) continue;
    if (!isEmptyBlock(el)) continue;
    if (el.localName === 'p') paragraphs++;
    el.remove();
  }
  for (const el of reverseElements(root, 'ul, ol')) {
    if (!el.querySelector('li')) el.remove();
  }
  for (const el of reverseElements(root, 'thead, tbody, tfoot')) {
    if (!el.querySelector('tr')) el.remove();
  }
  for (const el of reverseElements(root, 'table')) {
    if (!el.querySelector('tr')) el.remove();
  }
  if (paragraphs) rep.add('empty-paragraph-removed', paragraphs);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function ownRows(table: Element): Element[] {
  return elements(table, 'tr').filter((r) => r.closest('table') === table);
}

function cellsOf(row: Element): Element[] {
  return Array.from(row.children).filter((c) => c.localName === 'td' || c.localName === 'th');
}

function unwrapLayoutTables(root: Element, rep: Reporter): void {
  for (const table of reverseElements(root, 'table')) {
    const rows = ownRows(table);
    const cells = rows.flatMap(cellsOf);
    const role = (table.getAttribute('role') ?? '').toLowerCase();
    const presentational = role === 'presentation' || role === 'none';
    if (!(cells.length === 1 || (presentational && cells.length > 0))) continue;

    const out: Node[] = [];
    const caption = table.querySelector(':scope > caption');
    if (caption && textOf(caption) !== '') {
      const p = table.ownerDocument.createElement('p');
      const strong = table.ownerDocument.createElement('strong');
      while (caption.firstChild) strong.appendChild(caption.firstChild);
      p.appendChild(strong);
      out.push(p);
    }
    for (const cell of cells) out.push(...blockify(cell));
    table.replaceWith(...out);
    rep.add('layout-table-unwrapped');
  }
}

function promoteTableHeaders(root: Element, rep: Reporter): void {
  for (const table of elements(root, 'table')) {
    const rows = ownRows(table);
    if (rows.length < 2) continue;
    const thead = Array.from(table.children).find((c) => c.localName === 'thead');
    const hasTh = rows.some((r) => cellsOf(r).some((c) => c.localName === 'th'));

    if (thead || hasTh) {
      // Existing header: make sure cells in <thead> are <th> with a scope.
      let scoped = 0;
      if (thead) {
        for (const r of ownRows(table).filter((r) => r.parentElement === thead)) {
          for (const c of cellsOf(r)) {
            const th = c.localName === 'td' ? rename(c, 'th') : c;
            if (!th.hasAttribute('scope')) {
              th.setAttribute('scope', 'col');
              scoped++;
            }
          }
        }
      }
      if (scoped) rep.add('table-scope-added');
      continue;
    }

    const first = rows[0];
    const cells = cellsOf(first);
    if (!cells.length) continue;
    if (cells.some((c) => (c.getAttribute('rowspan') ?? '1') !== '1')) continue;
    const filled = cells.filter((c) => textOf(c) !== '');
    if (!filled.length || !filled.every(isEntirelyBold)) continue;

    for (const c of cells) {
      const th = rename(c, 'th');
      th.setAttribute('scope', 'col');
    }
    const newHead = table.ownerDocument.createElement('thead');
    const body = first.parentElement;
    if (body && body.localName === 'tbody') body.before(newHead);
    else first.before(newHead);
    newHead.appendChild(first);
    rep.add('table-header-added');
  }
}

/**
 * `headers="c1 c2"` on a cell points at ids that the presentation switch
 * strips (only our own anchors survive). Give every referenced header cell a
 * deterministic id of our own and repoint the references; drop references
 * that resolve to nothing so none dangle (WCAG 1.3.1).
 */
function fixTableHeaders(root: Element, sectionId: string, rep: Reporter): void {
  const tables = elements(root, 'table');
  let fixed = 0;
  tables.forEach((table, t) => {
    const cells = elements(table, 'td[headers], th[headers]').filter((c) => c.closest('table') === table);
    if (!cells.length) return;
    const byOldId = new Map<string, Element>();
    for (const c of elements(table, 'td[id], th[id]')) {
      if (c.closest('table') !== table) continue;
      const id = c.getAttribute('id') ?? '';
      if (id && !byOldId.has(id)) byOldId.set(id, c);
    }
    const newIds = new Map<Element, string>();
    for (const cell of cells) {
      const refs = (cell.getAttribute('headers') ?? '').split(/\s+/).filter(Boolean);
      const kept: string[] = [];
      for (const ref of refs) {
        const target = byOldId.get(ref);
        if (!target || target === cell) continue;
        let id = newIds.get(target);
        if (!id) {
          id = `${sectionId}-t${t + 1}-c${newIds.size + 1}`;
          newIds.set(target, id);
        }
        if (!kept.includes(id)) kept.push(id);
      }
      if (kept.length) cell.setAttribute('headers', kept.join(' '));
      else cell.removeAttribute('headers');
    }
    for (const [target, id] of newIds) target.setAttribute('id', id);
    fixed++;
  });
  if (fixed) rep.add('table-headers-fixed', fixed);
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** Nearest preceding element sibling, skipping blank text. */
function previousElement(node: Node): Element | null {
  let n: Node | null = node.previousSibling;
  while (n && isText(n) && isBlank(n.data)) n = n.previousSibling;
  return isElement(n) ? n : null;
}

/**
 * Repair list markup that assistive technology cannot read: a list nested
 * directly inside a list (no <li> around it) moves into the item before it;
 * other stray children are wrapped in an item; an <li> outside any list is
 * wrapped, together with adjacent orphans, in a new <ul>.
 */
function fixLists(root: Element, rep: Reporter): void {
  const doc = root.ownerDocument;
  let fixed = 0;

  for (const list of reverseElements(root, 'ul, ol')) {
    let repaired = false;
    let wrapper: Element | null = null; // the <li> we are collecting stray inline content into
    for (const node of Array.from(list.childNodes)) {
      if (isElement(node) && node.localName === 'li') {
        wrapper = null;
        continue;
      }
      if (isText(node) && isBlank(node.data)) continue;
      if (node.nodeType === 8) {
        list.removeChild(node);
        continue;
      }
      repaired = true;
      if (isElement(node) && (node.localName === 'ul' || node.localName === 'ol')) {
        const prev = previousElement(node);
        if (prev && prev.localName === 'li') {
          prev.appendChild(node);
          wrapper = null;
          continue;
        }
      }
      if (!wrapper) {
        wrapper = doc.createElement('li');
        list.insertBefore(wrapper, node);
      }
      wrapper.appendChild(node);
    }
    if (repaired) fixed++;
  }

  for (const li of elements(root, 'li')) {
    const parent = li.parentElement;
    if (!parent || !root.contains(li)) continue;
    if (parent.localName === 'ul' || parent.localName === 'ol' || parent.localName === 'menu') continue;
    const list = doc.createElement('ul');
    li.before(list);
    const run: Node[] = [li];
    let pending: Node[] = [];
    for (let n: Node | null = li.nextSibling; n; n = n.nextSibling) {
      if (isText(n) && isBlank(n.data)) {
        pending.push(n);
        continue;
      }
      if (isElement(n) && n.localName === 'li') {
        run.push(...pending, n);
        pending = [];
        continue;
      }
      break;
    }
    for (const n of run) list.appendChild(n);
    fixed++;
  }

  if (fixed) rep.add('list-markup-fixed', fixed);
}

// ---------------------------------------------------------------------------
// Fake lists
// ---------------------------------------------------------------------------

const BULLET_RE = /^[\s ]*(?:[-–—•·◦‣▪●■⁃*])[\s ]+/;
const NUMBER_RE = /^[\s ]*(\d{1,3})[.)][\s ]+/;

type Marker = { kind: 'ul'; len: number } | { kind: 'ol'; len: number; n: number };

function markerOf(p: Element): Marker | null {
  const text = p.textContent ?? '';
  const b = text.match(BULLET_RE);
  if (b) return { kind: 'ul', len: b[0].length };
  const n = text.match(NUMBER_RE);
  if (n) return { kind: 'ol', len: n[0].length, n: Number(n[1]) };
  return null;
}

function nextParagraph(el: Element): Element | null {
  let n: Node | null = el.nextSibling;
  while (n && isText(n) && isBlank(n.data)) n = n.nextSibling;
  return isElement(n) && n.localName === 'p' ? n : null;
}

function convertFakeLists(root: Element, rep: Reporter): void {
  const seen = new Set<Element>();
  for (const p of elements(root, 'p')) {
    if (seen.has(p) || !root.contains(p)) continue;
    const first = markerOf(p);
    if (!first) continue;

    const run: { p: Element; m: Marker }[] = [{ p, m: first }];
    let expect = first.kind === 'ol' ? first.n + 1 : 0;
    for (let next = nextParagraph(p); next; next = nextParagraph(next)) {
      const m = markerOf(next);
      if (!m || m.kind !== first.kind) break;
      if (m.kind === 'ol') {
        if (m.n !== expect) break;
        expect++;
      }
      run.push({ p: next, m });
    }
    for (const r of run) seen.add(r.p);
    if (run.length < 2) continue;

    const doc = root.ownerDocument;
    const list = doc.createElement(first.kind);
    if (first.kind === 'ol' && first.n !== 1) list.setAttribute('start', String(first.n));
    const gaps: Node[] = [];
    for (const { p: item, m } of run) {
      stripLeadingChars(item, m.len);
      const li = doc.createElement('li');
      const style = item.getAttribute('style');
      if (style) li.setAttribute('style', style);
      while (item.firstChild) li.appendChild(item.firstChild);
      list.appendChild(li);
      // whitespace text between paragraphs goes away with them
      let n: Node | null = item.nextSibling;
      while (n && isText(n) && isBlank(n.data)) {
        gaps.push(n);
        n = n.nextSibling;
      }
    }
    run[0].p.replaceWith(list);
    for (const r of run.slice(1)) r.p.remove();
    for (const g of gaps) g.parentNode?.removeChild(g);
    rep.add('fake-list-converted');
  }
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i;

const VAGUE = new Set([
  'click here', 'here', 'this page', 'link', 'this link', 'read more', 'more', 'learn more', 'more info',
  'click', 'this', 'website', 'page', 'download', 'go', 'see more', 'info', 'details', 'view', 'open',
  'continue', 'next', 'url',
]);

function fixLinks(root: Element, idMap: Map<string, string>, rep: Reporter): void {
  for (const a of elements(root, 'a')) {
    const href = a.getAttribute('href');
    if (href === null || isBlank(href)) {
      unwrap(a);
      rep.add('empty-link-unwrapped');
      continue;
    }
    if (a.hasAttribute('data-sg-anchor')) {
      a.removeAttribute('data-sg-anchor'); // cross-section anchor made by the link pass
      continue;
    }
    if (href.startsWith('#')) {
      const target = idMap.get(href.slice(1));
      if (target) {
        a.setAttribute('href', '#' + target);
        rep.add('anchor-link-rewritten');
      } else {
        unwrap(a);
        rep.add('anchor-link-unwrapped', 1, href.slice(0, 40));
      }
      continue;
    }
    if (textOf(a) === '' && !a.querySelector('img')) {
      a.remove();
      rep.add('empty-link-unwrapped');
    }
  }

  // Adjacent duplicates: <a href=x>Foo</a><a href=x> bar</a>
  for (const a of elements(root, 'a[href]')) {
    if (!root.contains(a)) continue;
    for (;;) {
      let next: Node | null = a.nextSibling;
      let gap: Text | null = null;
      if (next && isText(next) && isBlank(next.data)) {
        gap = next;
        next = next.nextSibling;
      }
      if (!isElement(next) || next.localName !== 'a' || next.getAttribute('href') !== a.getAttribute('href')) break;
      if (gap) a.appendChild(gap);
      while (next.firstChild) a.appendChild(next.firstChild);
      next.remove();
      rep.add('duplicate-link-merged');
    }
  }

  for (const a of elements(root, 'a[href]')) {
    if (a.closest('.sg-embed')) continue; // our own "Embedded content: <host>" link, labelled by its note
    const text = textOf(a);
    const key = text.toLowerCase().replace(/[.!:,;»>→]+$/, '').trim();
    if (VAGUE.has(key) || /^(?:https?:\/\/|www\.)\S+$/i.test(key)) rep.add('vague-link-text', 1, text);
    // "ttran@x.edu" that actually mails someone else: the visible address must match the target (DESIGN.md §6d).
    const href = a.getAttribute('href') ?? '';
    if (/^mailto:/i.test(href) && EMAIL_RE.test(key)) {
      const target = href.slice('mailto:'.length).split('?')[0].trim().toLowerCase();
      if (target && target !== key) rep.add('link-email-mismatch', 1, `${text} → ${target}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Language tags
// ---------------------------------------------------------------------------

/** A `lang` that is not a language tag misdirects screen readers (WCAG 3.1.2); drop it. */
function fixLang(root: Element, rep: Reporter): void {
  let removed = 0;
  for (const el of elements(root, '[lang]')) {
    const value = (el.getAttribute('lang') ?? '').trim();
    if (value && isLanguageTag(value)) {
      if (value !== el.getAttribute('lang')) el.setAttribute('lang', value);
      continue;
    }
    el.removeAttribute('lang');
    removed++;
  }
  if (removed) rep.add('invalid-lang-removed', removed);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const TINY = 24;
const WIDE_MIN_WIDTH = 600;
const WIDE_ASPECT = 1.3;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|bmp|tiff?|avif|heic)$/i;

function isFilenameAlt(alt: string, name: string): boolean {
  const a = cleanText(alt).toLowerCase();
  if (!a) return false;
  const n = name.toLowerCase();
  if (n && (a === n || a === n.replace(IMAGE_EXT, ''))) return true;
  if (/^[\w\-. ()%]+$/.test(a) && IMAGE_EXT.test(a)) return true;
  return /^(?:image|img|picture|photo|screenshot|screen shot|untitled)[-_ ]?[\w-]*$/i.test(a);
}

/**
 * The link this image is the only name of: an <a href> with no text of its
 * own, no title, and no other image with a usable alt. Blanking this image's
 * alt would leave the link nameless (WCAG 2.4.4), so its alt is never cleared.
 */
function nameLessLink(img: Element): Element | null {
  const a = img.closest('a[href]');
  if (!a || isBlank(a.getAttribute('href')) || !isBlank(a.getAttribute('title'))) return null;
  if (textOf(a) !== '') return null;
  for (const other of Array.from(a.querySelectorAll('img'))) {
    if (other === img) continue;
    const alt = other.getAttribute('alt');
    if (alt && cleanText(alt) !== '' && !isFilenameAlt(alt, other.getAttribute('data-sg-file') ?? '')) return null;
  }
  return a;
}

/** The <figcaption> text of the figure this image sits in, or '' when there is none. */
function captionOf(img: Element): string {
  const figure = img.closest('figure');
  const caption = figure?.querySelector(':scope > figcaption');
  return caption ? textOf(caption) : '';
}

function fixImages(root: Element, rep: Reporter): void {
  const reportedLinks = new Set<Element>();
  for (const img of elements(root, 'img')) {
    const name = img.getAttribute('data-sg-file') ?? '';
    const alt = img.getAttribute('alt');
    const role = (img.getAttribute('role') ?? '').toLowerCase();
    const style = styleOf(img);
    const src = img.getAttribute('src') ?? '';
    const intrinsic = src.startsWith('data:') ? imageDimensions(src) : null;
    const width = pxOf(img.getAttribute('width')) ?? pxOf(style.get('width')) ?? intrinsic?.width ?? null;
    const height = pxOf(img.getAttribute('height')) ?? pxOf(style.get('height')) ?? intrinsic?.height ?? null;
    const tiny = width !== null && height !== null && width <= TINY && height <= TINY;
    const blank = alt !== null && cleanText(alt) === '';
    const filenameAlt = alt !== null && !blank && isFilenameAlt(alt, name);
    const link = nameLessLink(img);
    const caption = captionOf(img);

    if (link) {
      // Whatever the alt is, it is the link's only name: keep it, ask for better.
      if ((alt === null || blank || filenameAlt) && !reportedLinks.has(link)) {
        reportedLinks.add(link);
        rep.add('image-link-needs-text', 1, name || undefined);
      }
    } else if (role === 'presentation' || role === 'none') {
      if (alt !== '') {
        img.setAttribute('alt', '');
        rep.add('decorative-image-marked', 1, name || undefined);
      }
    } else if (alt === null) {
      if (tiny) {
        img.setAttribute('alt', '');
        rep.add('decorative-image-marked', 1, name || undefined);
      } else {
        rep.add('image-missing-alt', 1, name || undefined);
      }
    } else if (filenameAlt) {
      img.setAttribute('alt', '');
      // A figure captioned with the same filename is the image; it still needs describing.
      if (caption && isFilenameAlt(caption, name)) rep.add('image-missing-alt', 1, name || alt);
      else rep.add('filename-alt-cleared', 1, alt);
    } else if (blank) {
      if (alt !== '') img.setAttribute('alt', '');
      // Empty alt on a full-size image with no caption: decorative by accident, most often.
      if (!tiny && !caption) rep.add('image-empty-alt', 1, name || undefined);
    }

    const parent = img.parentElement;
    const alone = !!parent && parent.localName === 'p' && textOf(parent) === '' && parent.querySelectorAll('img').length === 1;
    const hint = /screen[-_ ]?shot|capture|snip|clipboard/i.test(name);
    const wide = width !== null && height !== null && width >= WIDE_MIN_WIDTH && width / height >= WIDE_ASPECT && alone;
    if (hint || wide) rep.add('image-may-contain-text', 1, name || undefined);
  }

  // A figure whose caption is empty is just an image
  for (const fc of reverseElements(root, 'figcaption')) {
    if (isEmptyBlock(fc) && !hasSignificantContent(fc)) fc.remove();
  }
}

/** A heading with no text and no described image has no name; it becomes a paragraph. */
function demoteEmptyHeadings(root: Element, rep: Reporter): void {
  let demoted = 0;
  for (const h of elements(root, HEADINGS)) {
    if (textOf(h) !== '' || !hasSignificantContent(h)) continue;
    if (Array.from(h.querySelectorAll('img')).some((i) => cleanText(i.getAttribute('alt')) !== '')) continue;
    rename(h, 'p');
    demoted++;
  }
  if (demoted) rep.add('empty-heading-demoted', demoted);
}
