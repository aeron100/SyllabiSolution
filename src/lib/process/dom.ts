/**
 * Shared DOM helpers for the processing pipeline.
 *
 * Every pass works on an inert document produced by DOMParser, so nothing
 * here ever touches the live page: no scripts run and no resources load,
 * in the browser or under jsdom.
 */

import { splitDeclarations } from '../css-safety';

export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Elements that establish a block in the flow (used for empties, blockify, alignment). */
export const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'div', 'blockquote', 'pre', 'hr', 'figure', 'figcaption', 'address',
  'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'details', 'summary', 'center',
]);

/** Blocks that may directly contain other blocks (a <p> may not). */
export const BLOCK_CONTAINERS = new Set([
  'div', 'li', 'td', 'th', 'blockquote', 'figure', 'dd', 'section', 'article', 'aside',
  'header', 'footer', 'nav', 'main', 'details', 'center', 'caption', 'body',
]);

/** Inline formatting wrappers that carry no meaning once empty. */
export const INLINE_FORMAT_TAGS = new Set([
  'span', 'font', 'b', 'i', 'strong', 'em', 'u', 's', 'strike', 'small', 'mark', 'sup', 'sub',
  'cite', 'q', 'dfn', 'kbd', 'samp', 'var', 'abbr', 'ins', 'del', 'big', 'tt',
]);

/** Descendants that make an otherwise text-less block worth keeping. */
const SIGNIFICANT = 'img, hr, table, math, ul, ol, dl, figure, .sg-embed, .sg-media, .sg-missing-image, .sg-equation';

export function newInertDocument(html = ''): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function isElement(n: Node | null | undefined): n is Element {
  return !!n && n.nodeType === 1;
}

export function isText(n: Node | null | undefined): n is Text {
  return !!n && n.nodeType === 3;
}

export function isMath(el: Element): boolean {
  return el.namespaceURI === MATHML_NS;
}

export function isBlock(n: Node | null | undefined): boolean {
  return isElement(n) && BLOCK_TAGS.has(n.localName);
}

export function isHeading(n: Node | null | undefined): n is HTMLHeadingElement {
  return isElement(n) && /^h[1-6]$/.test(n.localName);
}

export function headingLevel(el: Element): number {
  return Number(el.localName.slice(1));
}

/** Whitespace test that treats NBSP and zero-width characters as blank. */
export function isBlank(s: string | null | undefined): boolean {
  return !s || /^[\s ​﻿]*$/.test(s);
}

/** Collapse whitespace (NBSP included) and trim. */
export function cleanText(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s ​﻿]+/g, ' ').trim();
}

export function textOf(n: Node): string {
  return cleanText(n.textContent);
}

export function elements(root: Element, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

/** Document order reversed, so descendants are visited before ancestors. */
export function reverseElements(root: Element, selector: string): Element[] {
  return elements(root, selector).reverse();
}

/** Replace an element with its children. */
export function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** Replace an element with one of another tag, keeping attributes and children. */
export function rename(el: Element, tagName: string): Element {
  const out = el.ownerDocument.createElement(tagName);
  for (const a of Array.from(el.attributes)) out.setAttribute(a.name, a.value);
  while (el.firstChild) out.appendChild(el.firstChild);
  el.replaceWith(out);
  return out;
}

export function hasSignificantContent(el: Element): boolean {
  return el.querySelector(SIGNIFICANT) !== null;
}

/** True when the element has neither text nor anything visible. */
export function isEmptyBlock(el: Element): boolean {
  return textOf(el) === '' && !hasSignificantContent(el);
}

export function addClass(el: Element, cls: string): void {
  const existing = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  if (!existing.includes(cls)) existing.push(cls);
  el.setAttribute('class', existing.join(' '));
}

/**
 * Turn the children of a container into a flat list of block nodes:
 * blocks pass through, runs of inline content are wrapped in <p>.
 * Whitespace-only runs are dropped. The container is left empty.
 */
export function blockify(container: Element): Node[] {
  const doc = container.ownerDocument;
  const out: Node[] = [];
  let run: Node[] = [];
  const flush = () => {
    if (run.length) {
      const text = run.map((n) => n.textContent ?? '').join('');
      const hasEl = run.some((n) => isElement(n) && (n.localName === 'img' || n.localName === 'math'));
      if (!isBlank(text) || hasEl) {
        const p = doc.createElement('p');
        for (const n of run) p.appendChild(n);
        out.push(p);
      }
      run = [];
    }
  };
  for (const n of Array.from(container.childNodes)) {
    if (isBlock(n)) {
      flush();
      out.push(n);
    } else if (n.nodeType === 8) {
      // comments never survive
      n.parentNode?.removeChild(n);
    } else {
      run.push(n);
    }
  }
  flush();
  return out;
}

/** Split a style attribute into declarations (shared with the assembler's guard). */
export { splitDeclarations };

/** Loose BCP-47 shape check: "en", "en-US", "zh-Hant-TW", "es-419". Same rule as the assembler. */
export function isLanguageTag(s: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(s);
}

/** Parse an inline style string into a property map (last declaration wins). */
export function parseStyle(style: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!style) return map;
  for (const decl of splitDeclarations(style)) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim().replace(/\s*!important$/i, '');
    if (prop && value) map.set(prop, value);
  }
  return map;
}

export function styleOf(el: Element): Map<string, string> {
  return parseStyle(el.getAttribute('style'));
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Last path segment of a URL or cartridge path, decoded, without query or hash. */
export function basename(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '');
  const seg = clean.slice(clean.lastIndexOf('/') + 1);
  return safeDecode(seg);
}

/** Numeric pixel value from an attribute or CSS length ("400", "400px"); null otherwise. */
export function pxOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  return m ? Math.round(Number(m[1])) : null;
}

/** Percentage value from "57%" ; null otherwise. */
export function percentOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)%$/);
  return m ? Math.round(Number(m[1])) : null;
}

/** Font size in CSS px from an inline value; null when unknown or relative to context (var(), inherit). */
export function fontSizePx(value: string | null | undefined): number | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const keywords: Record<string, number> = {
    'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32,
    'xxx-large': 48, larger: 19.2, smaller: 13.3,
  };
  if (v in keywords) return keywords[v];
  const m = v.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'px': return n;
    case 'pt': return (n * 4) / 3;
    case 'em':
    case 'rem': return n * 16;
    case '%': return n * 0.16;
    default: return null;
  }
}

export function isBoldWeight(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (v === 'bold' || v === 'bolder') return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 600;
}

/** Whether an element itself is bold by tag or inline style. */
export function isBoldElement(el: Element): boolean {
  const t = el.localName;
  if (t === 'strong' || t === 'b' || t === 'th' || /^h[1-6]$/.test(t)) return true;
  return isBoldWeight(styleOf(el).get('font-weight'));
}

/** Every non-blank text node inside `scope` sits under a bold ancestor (within scope, scope included). */
export function isEntirelyBold(scope: Element): boolean {
  const walker = scope.ownerDocument.createTreeWalker(scope, 4 /* SHOW_TEXT */);
  let sawText = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (isBlank(n.textContent)) continue;
    sawText = true;
    let bold = false;
    for (let a: Node | null = n.parentNode; a && a !== scope.parentNode; a = a.parentNode) {
      if (isElement(a) && isBoldElement(a)) {
        bold = true;
        break;
      }
    }
    if (!bold) return false;
  }
  return sawText;
}

/** Text nodes in document order. */
export function textNodes(scope: Node): Text[] {
  const out: Text[] = [];
  const walker = scope.ownerDocument!.createTreeWalker(scope, 4 /* SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Remove `count` leading characters of text from an element, across its text nodes. */
export function stripLeadingChars(el: Element, count: number): void {
  let left = count;
  for (const t of textNodes(el)) {
    if (left <= 0) break;
    const take = Math.min(left, t.data.length);
    t.data = t.data.slice(take);
    left -= take;
  }
}
