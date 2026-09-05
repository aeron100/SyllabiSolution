/**
 * Final safety guard (DESIGN.md §6b): the no-JavaScript rule is enforced a
 * second time on every section as it goes into the assembled document.
 *
 * The processing module already sanitizes each page. This pass is the
 * backstop so that no matter what a section string contains, the file that
 * leaves the assembler has no script, no event handlers, no script URLs and
 * none of the interactive elements the design forbids.
 *
 * It parses with the browser's own HTML parser, so the tricks a regex would
 * miss (tag names with odd casing, attributes with no leading whitespace,
 * entity-encoded URL schemes) are resolved before we look at them.
 */

import { safeStyle } from '../css-safety';

/** Removed outright, with their content. Matched by localName so SVG/MathML count. */
const REMOVE = new Set([
  'script',
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'style',
  'link',
  'meta',
  'base',
  // form controls
  'input',
  'button',
  'select',
  'textarea',
  'option',
  'optgroup',
  'datalist',
  'output',
  'keygen',
  // media and plugins (the processing pass already replaced them with notes)
  'video',
  'audio',
  'source',
  'track',
  'marquee',
  // raw-text elements re-serialise their content as markup ("<script>" inside <xmp>)
  'xmp',
  'plaintext',
  'noembed',
  'noframes',
  // inline SVG is not allowed in the document (same rule as the sanitizer)
  'svg',
  // SVG SMIL: can retarget attributes; useless in a printed document
  'set',
  'animate',
  'animatemotion',
  'animatetransform',
  'animatecolor',
  'discard',
  // the rest of the sanitizer's remove-with-content list: script-only or remote-loading
  'canvas',
  'map',
  'area',
  'dialog',
  'slot',
  'portal',
  'param',
]);

/** Unwrapped: the element goes, its children stay. */
const UNWRAP = new Set(['form', 'fieldset', 'label', 'legend']);

/** Attributes that carry URLs and must not point at script. */
const URL_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'xlink:href',
  'poster',
  'data',
  'ping',
  'background',
  'dynsrc',
  'lowsrc',
  'codebase',
  'cite',
  'longdesc',
  'usemap',
  'manifest',
]);

/**
 * Attributes removed unconditionally: script/HTML payload carriers, remote
 * image candidates (srcset), and target (a new window with no rel is a
 * reverse-tabnabbing vector and meaningless in print).
 */
const DROP_ATTRS = new Set([
  'srcdoc',
  'action',
  'formaction',
  'ping',
  'dynsrc',
  'lowsrc',
  'codebase',
  'manifest',
  'srcset',
  'target',
]);

/**
 * True when a URL attribute value resolves to a script-capable scheme.
 * Browsers strip C0 controls and whitespace while parsing URLs, so we do too
 * before looking at the scheme; then anything javascript:, vbscript:, or
 * data:text/html is rejected.
 */
export function isScriptUrl(value: string): boolean {
  // Strip every ASCII control character and all whitespace, then lowercase.
  // (Browsers strip tabs/newlines anywhere and controls at the ends; being
  // stricter than the browser only ever rejects more, never less.)
  let v = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c > 0x20 && c !== 0x7f) v += value[i];
  }
  v = v.toLowerCase();
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return true;
  if (v.startsWith('data:')) {
    const rest = v.slice(5);
    if (rest.startsWith('text/html') || rest.startsWith('text/javascript') || rest.startsWith('application/xhtml')) {
      return true;
    }
  }
  return false;
}

function scrubAttributes(el: Element): void {
  // Copy first: removing while iterating a live NamedNodeMap skips entries.
  const names: string[] = [];
  for (let i = 0; i < el.attributes.length; i++) names.push(el.attributes[i]!.name);
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.startsWith('on') || DROP_ATTRS.has(lower)) {
      el.removeAttribute(name);
      continue;
    }
    if (URL_ATTRS.has(lower)) {
      const value = el.getAttribute(name) ?? '';
      if (isScriptUrl(value)) el.removeAttribute(name);
      continue;
    }
    if (lower === 'style') {
      // Same declaration filter as the sanitizer: no url(), image-set(),
      // expression() or any function outside the allowlist.
      const value = el.getAttribute(name) ?? '';
      const safe = safeStyle(value);
      if (safe !== value) {
        if (safe === null) el.removeAttribute(name);
        else el.setAttribute(name, safe);
      }
      continue;
    }
    // http-equiv=refresh is only meaningful on <meta>, which is removed above,
    // but a stray refresh on any element is worth dropping too.
    if (lower === 'http-equiv') el.removeAttribute(name);
  }
}

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/**
 * Apply the guard to an HTML fragment (body content) and return the cleaned
 * serialization. Deterministic: same input → same output.
 */
export function guardHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    throw new Error('guardHtml needs a DOM (browser or jsdom)');
  }
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  const body = doc.body;

  // Walk once, collecting first so mutation does not disturb traversal.
  const all = Array.from(body.querySelectorAll('*'));
  const toRemove: Element[] = [];
  const toUnwrap: Element[] = [];
  for (const el of all) {
    const name = el.localName.toLowerCase();
    if (REMOVE.has(name)) {
      toRemove.push(el);
      continue;
    }
    if (UNWRAP.has(name)) toUnwrap.push(el);
    scrubAttributes(el);
  }
  for (const el of toRemove) el.parentNode?.removeChild(el);
  // Unwrap innermost-first so nested forms/fieldsets resolve cleanly.
  for (const el of toUnwrap.reverse()) unwrap(el);

  return body.innerHTML;
}
