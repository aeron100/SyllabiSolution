/**
 * Heading rules from DESIGN.md §6d: fake heading promotion, then
 * normalization (shift so the top level is h3, close gaps, clamp past h6,
 * drop a first heading that repeats the section title), then anchors.
 */
import {
  cleanText, elements, fontSizePx, headingLevel, isBlank, isElement, isEntirelyBold, isHeading, rename,
  styleOf, textNodes, textOf,
} from './dom';
import type { Reporter } from './report';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';
const MAX_FAKE_HEADING_LENGTH = 80;
const LARGER_RATIO = 1.15;
const DEFAULT_FONT_PX = 16;

// ---------------------------------------------------------------------------
// Fake heading promotion
// ---------------------------------------------------------------------------

export function promoteFakeHeadings(root: Element, rep: Reporter): void {
  const real = elements(root, HEADINGS);
  if (!real.length) return; // pages with no headings get nothing promoted
  const minLevel = Math.min(...real.map(headingLevel));
  const baseline = baselineFontSize(root);
  const doc = root.ownerDocument;

  for (const p of elements(root, 'p')) {
    if (p.closest('li, td, th')) continue;
    if (p.querySelector('img, a[href], br, math, code, .sg-embed, .sg-media, .sg-missing-image, .sg-equation')) continue;
    if (p.classList.contains('sg-embed') || p.classList.contains('sg-media')) continue;
    const text = textOf(p);
    if (!text || text.length >= MAX_FAKE_HEADING_LENGTH) continue;
    if (/[.…]$/.test(text)) continue;
    // Two sentences ("… Modules 05-08. Study hard!") are body text, not a heading.
    if (/[.!?…]\s+\p{Lu}/u.test(text)) continue;

    const bold = isEntirelyBold(p);
    const upper = isAllCaps(text);
    const large = isEntirelyLarge(p, baseline);
    if (!(bold || upper || large)) continue;

    const above = lastHeadingBefore(p, real);
    const level = above ? headingLevel(above) + 1 : minLevel + 1;
    if (level > 6) continue; // would only be clamped back to a bold paragraph

    const h = doc.createElement('h' + level);
    const style = p.getAttribute('style');
    if (style) h.setAttribute('style', style); // Original keeps the look
    while (p.firstChild) h.appendChild(p.firstChild);
    unwrapSoleBold(h);
    p.replaceWith(h);
    rep.add('fake-heading-promoted', 1, text);
  }
}

/** If the heading's only content is one <strong>/<b>, drop that wrapper. */
function unwrapSoleBold(h: Element): void {
  const kids = Array.from(h.childNodes).filter((n) => !(n.nodeType === 3 && isBlank(n.textContent)));
  if (kids.length === 1 && isElement(kids[0]) && (kids[0].localName === 'strong' || kids[0].localName === 'b')) {
    const wrapper = kids[0];
    while (wrapper.firstChild) h.insertBefore(wrapper.firstChild, wrapper);
    h.removeChild(wrapper);
  }
}

function lastHeadingBefore(p: Element, headings: Element[]): Element | null {
  let found: Element | null = null;
  for (const h of headings) {
    // DOCUMENT_POSITION_FOLLOWING (4): h comes after p in document order
    if (h.compareDocumentPosition(p) & 4) found = h;
    else break;
  }
  return found;
}

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  return letters.length >= 4 && text === text.toUpperCase() && text !== text.toLowerCase();
}

/** Nearest inline font-size on the node's ancestors, up to and including `stop`. */
function effectiveFontSize(node: Node, stop: Element): number | null {
  for (let a: Node | null = node.parentNode; a; a = a.parentNode) {
    if (isElement(a)) {
      const v = fontSizePx(styleOf(a).get('font-size'));
      if (v !== null) return v;
    }
    if (a === stop) break;
  }
  return null;
}

/** Weighted mode of font sizes over body text; text without an inline size counts as 16px. */
export function baselineFontSize(root: Element): number {
  const weights = new Map<number, number>();
  for (const t of textNodes(root)) {
    if (isBlank(t.data)) continue;
    if (isElement(t.parentNode) && t.parentNode.closest('h1, h2, h3, h4, h5, h6')) continue;
    const size = effectiveFontSize(t, root) ?? DEFAULT_FONT_PX;
    weights.set(size, (weights.get(size) ?? 0) + cleanText(t.data).length);
  }
  let best = DEFAULT_FONT_PX;
  let bestW = -1;
  for (const [size, w] of Array.from(weights.entries()).sort((a, b) => a[0] - b[0])) {
    if (w > bestW) {
      best = size;
      bestW = w;
    }
  }
  return best;
}

function isEntirelyLarge(p: Element, baseline: number): boolean {
  let sawText = false;
  for (const t of textNodes(p)) {
    if (isBlank(t.data)) continue;
    sawText = true;
    const size = effectiveFontSize(t, p);
    if (size === null || size < baseline * LARGER_RATIO) return false;
  }
  return sawText;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeHeadings(root: Element, sectionTitle: string, rep: Reporter): void {
  let hs = elements(root, HEADINGS);
  if (!hs.length) return;

  const title = cleanText(sectionTitle).toLowerCase();
  if (title && textOf(hs[0]).toLowerCase() === title) {
    hs[0].remove();
    rep.add('redundant-title-removed');
    hs = hs.slice(1);
  }

  // A stack of (original level, new level): shifts the top level to 3 and
  // closes gaps while keeping the page's own relative structure.
  const stack: { orig: number; level: number }[] = [];
  let changed = 0;
  let clamped = 0;
  for (const h of hs) {
    const orig = headingLevel(h);
    while (stack.length && stack[stack.length - 1].orig >= orig) stack.pop();
    const level = stack.length ? stack[stack.length - 1].level + 1 : 3;
    stack.push({ orig, level });
    if (level > 6) {
      clampHeading(h);
      clamped++;
    } else if (level !== orig) {
      rename(h, 'h' + level);
      changed++;
    }
  }
  if (changed) rep.add('heading-normalized', changed);
  if (clamped) rep.add('heading-clamped', clamped);
}

/** Past h6: a paragraph with bold lead-in text. */
function clampHeading(h: Element): void {
  const doc = h.ownerDocument;
  const p = doc.createElement('p');
  for (const a of Array.from(h.attributes)) p.setAttribute(a.name, a.value);
  const strong = doc.createElement('strong');
  while (h.firstChild) strong.appendChild(h.firstChild);
  p.appendChild(strong);
  h.replaceWith(p);
}

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

/**
 * Give every heading a deterministic id "<sectionId>-h<n>". Returns a map of
 * original ids (headings only) to the new ids, for in-page links.
 */
export function assignHeadingIds(root: Element, sectionId: string): Map<string, string> {
  const map = new Map<string, string>();
  let n = 0;
  for (const h of elements(root, HEADINGS)) {
    if (!isHeading(h)) continue;
    n++;
    const id = `${sectionId}-h${n}`;
    const orig = h.getAttribute('id');
    if (orig && !map.has(orig)) map.set(orig, id);
    // an anchor element inside the heading also names it
    for (const a of Array.from(h.querySelectorAll('[id]'))) {
      const aid = a.getAttribute('id');
      if (aid && !map.has(aid)) map.set(aid, id);
    }
    h.setAttribute('id', id);
  }
  return map;
}
