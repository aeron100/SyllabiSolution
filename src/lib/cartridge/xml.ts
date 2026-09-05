/**
 * Namespace-agnostic XML/HTML helpers on top of the browser DOMParser.
 * Everything matches on localName so Canvas, Moodle, Blackboard, and D2L
 * namespace variants all work (DESIGN.md §3).
 */

/** Parse XML; returns null on malformed input instead of throwing. */
export function parseXml(text: string): Document | null {
  try {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const doc = new DOMParser().parseFromString(src, 'application/xml');
    const root = doc.documentElement;
    if (!root || root.localName === 'parsererror') return null;
    if (doc.getElementsByTagName('parsererror').length > 0) return null;
    return doc;
  } catch {
    return null;
  }
}

/** Parse an HTML fragment or document leniently. */
export function parseHtml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/html');
}

/** Direct element children with the given localName. */
export function children(el: ParentNode, local: string): Element[] {
  const out: Element[] = [];
  for (const c of Array.from(el.children)) if (c.localName === local) out.push(c);
  return out;
}

/** First direct child with the given localName. */
export function child(el: ParentNode, local: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === local) return c;
  return null;
}

/** Trimmed text of a direct child, or undefined when missing/empty. */
export function childText(el: ParentNode, local: string): string | undefined {
  const c = child(el, local);
  if (!c) return undefined;
  const t = (c.textContent ?? '').trim();
  return t === '' ? undefined : t;
}

/** All descendants (any namespace) with the given localName, in document order. */
export function all(root: Document | Element, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', local));
}

/** First descendant (any namespace) with the given localName. */
export function first(root: Document | Element, local: string): Element | null {
  const list = root.getElementsByTagNameNS('*', local);
  return list.length > 0 ? list[0] : null;
}

/** Trimmed text of the first descendant with the given localName. */
export function firstText(root: Document | Element, local: string): string | undefined {
  const el = first(root, local);
  if (!el) return undefined;
  const t = (el.textContent ?? '').trim();
  return t === '' ? undefined : t;
}

/** Attribute value, or undefined when absent or empty. */
export function attr(el: Element | null, name: string): string | undefined {
  if (!el) return undefined;
  const v = el.getAttribute(name);
  return v === null || v === '' ? undefined : v;
}

/** parseFloat that returns undefined for missing or non-numeric input. */
export function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}
